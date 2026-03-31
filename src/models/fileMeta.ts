import { getDB } from '../db';

// 核心数据表模型定义
export interface FileMeta {
  relative_path: string; // 文件相对路径 (作为唯一键)
  title: string | null; // 自定义标题
  description: string | null; // 详细介绍说明 (支持 Markdown)
  is_public: boolean; // 分享状态 (是否公开)
  access_password?: string | null; // 访问密码 (可选)
  share_id?: string | null; // 自定义分享 ID (短后缀)
  expires_at?: string | null; // 分享过期时间
  max_views?: number | null; // 最大访问次数
  max_downloads?: number | null; // 最大下载次数
  views?: number; // 当前访问次数
  downloads?: number; // 当前下载次数
  created_at?: string;
  updated_at?: string;
}

function mapFileMetaRow(row: any): FileMeta | undefined {
  if (!row) return undefined;

  return {
    ...row,
    is_public: row.is_public === 1,
    max_views: row.max_views == null ? null : Number(row.max_views),
    max_downloads: row.max_downloads == null ? null : Number(row.max_downloads),
    views: row.views == null ? 0 : Number(row.views),
    downloads: row.downloads == null ? 0 : Number(row.downloads),
  } as FileMeta;
}

function replacePathPrefix(targetPath: string, sourcePath: string, destinationPath: string): string {
  if (targetPath === sourcePath) return destinationPath;
  return `${destinationPath}${targetPath.slice(sourcePath.length)}`;
}

export const FileMetaModel = {
  // 获取文件扩展信息
  findByPath: async (relativePath: string): Promise<FileMeta | undefined> => {
    const db = getDB();
    const row = await db.get(`
      SELECT 
        fm.*, 
        (
          SELECT COUNT(*) 
          FROM file_events fe 
          WHERE fe.relative_path = fm.relative_path AND fe.event_type = 'view'
        ) AS views,
        (
          SELECT COUNT(*) 
          FROM file_events fe 
          WHERE fe.relative_path = fm.relative_path AND fe.event_type = 'download'
        ) AS downloads
      FROM files_meta fm
      WHERE fm.relative_path = ?
    `, [relativePath]);

    return mapFileMetaRow(row);
  },

  // 通过分享 ID 查找文件
  findByShareId: async (shareId: string): Promise<FileMeta | undefined> => {
    const db = getDB();
    const row = await db.get(`
      SELECT 
        fm.*, 
        (
          SELECT COUNT(*) 
          FROM file_events fe 
          WHERE fe.relative_path = fm.relative_path AND fe.event_type = 'view'
        ) AS views,
        (
          SELECT COUNT(*) 
          FROM file_events fe 
          WHERE fe.relative_path = fm.relative_path AND fe.event_type = 'download'
        ) AS downloads
      FROM files_meta fm
      WHERE fm.share_id = ?
    `, [shareId]);

    return mapFileMetaRow(row);
  },

  // 获取所有公开分享的文件
  findAllShared: async (): Promise<FileMeta[]> => {
    const db = getDB();
    const rows = await db.all(`
      SELECT 
        fm.*, 
        COALESCE(SUM(CASE WHEN fe.event_type = 'view' THEN 1 ELSE 0 END), 0) AS views,
        COALESCE(SUM(CASE WHEN fe.event_type = 'download' THEN 1 ELSE 0 END), 0) AS downloads
      FROM files_meta fm
      LEFT JOIN file_events fe ON fe.relative_path = fm.relative_path
      WHERE fm.is_public = 1
      GROUP BY fm.relative_path
      ORDER BY fm.updated_at DESC
    `);

    return rows
      .map(mapFileMetaRow)
      .filter((row): row is FileMeta => !!row);
  },

  // 插入或更新文件扩展信息
  upsert: async (meta: FileMeta) => {
    const db = getDB();
    const query = `
      INSERT INTO files_meta (
        relative_path, title, description, is_public, access_password, share_id, expires_at, max_views, max_downloads, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        is_public = excluded.is_public,
        access_password = excluded.access_password,
        share_id = excluded.share_id,
        expires_at = excluded.expires_at,
        max_views = excluded.max_views,
        max_downloads = excluded.max_downloads,
        updated_at = CURRENT_TIMESTAMP
    `;

    return await db.run(query, [
      meta.relative_path,
      meta.title || null,
      meta.description || null,
      meta.is_public ? 1 : 0,
      meta.access_password || null,
      meta.share_id || null,
      meta.expires_at || null,
      meta.max_views ?? null,
      meta.max_downloads ?? null,
    ]);
  },

  getShareStats: async (relativePath: string): Promise<{ views: number; downloads: number }> => {
    const db = getDB();
    const row = await db.get(`
      SELECT 
        COALESCE(SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END), 0) AS views,
        COALESCE(SUM(CASE WHEN event_type = 'download' THEN 1 ELSE 0 END), 0) AS downloads
      FROM file_events
      WHERE relative_path = ?
    `, [relativePath]);

    return {
      views: row?.views == null ? 0 : Number(row.views),
      downloads: row?.downloads == null ? 0 : Number(row.downloads),
    };
  },

  // 记录访问事件
  logEvent: async (relativePath: string, eventType: 'view' | 'download') => {
    const db = getDB();
    return await db.run('INSERT INTO file_events (relative_path, event_type) VALUES (?, ?)', [relativePath, eventType]);
  },

  // 获取过去 N 天的聚合统计数据 (用于图表)
  getGlobalStats: async (days: number = 14) => {
    const db = getDB();
    const query = `
      SELECT 
        date(created_at) as date,
        SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as view_count,
        SUM(CASE WHEN event_type = 'download' THEN 1 ELSE 0 END) as download_count
      FROM file_events
      WHERE created_at > date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `;
    return await db.all(query, [days]);
  },

  // 获取热门文件统计
  getHotFiles: async (limit: number = 10) => {
    const db = getDB();
    const query = `
      SELECT 
        relative_path,
        SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
        SUM(CASE WHEN event_type = 'download' THEN 1 ELSE 0 END) as downloads
      FROM file_events
      GROUP BY relative_path
      ORDER BY downloads DESC, views DESC
      LIMIT ?
    `;
    return await db.all(query, [limit]);
  },

  // 删除文件扩展信息（支持递归删除文件夹元数据与事件）
  deleteByPath: async (relativePath: string) => {
    const db = getDB();
    // 构造前缀匹配模式： e.g. "folder/%"
    const prefix = relativePath.endsWith('/') ? relativePath : `${relativePath}/`;
    
    // 同步删除统计记录
    await db.run('DELETE FROM file_events WHERE relative_path = ? OR relative_path LIKE ?', [relativePath, `${prefix}%`]);
    // 同步删除元数据记录
    return await db.run('DELETE FROM files_meta WHERE relative_path = ? OR relative_path LIKE ?', [relativePath, `${prefix}%`]);
  },

  // 路径重命名 / 移动时，同步迁移元数据与统计记录
  movePathRecords: async (sourcePath: string, destinationPath: string) => {
    const db = getDB();
    const sourcePrefix = `${sourcePath}/`;

    const metaRows = await db.all('SELECT * FROM files_meta WHERE relative_path = ? OR relative_path LIKE ?', [sourcePath, `${sourcePrefix}%`]);
    const eventRows = await db.all('SELECT relative_path, event_type, created_at FROM file_events WHERE relative_path = ? OR relative_path LIKE ?', [sourcePath, `${sourcePrefix}%`]);

    if (metaRows.length === 0 && eventRows.length === 0) {
      return;
    }

    await db.exec('BEGIN IMMEDIATE');
    try {
      if (metaRows.length > 0) {
        await db.run('DELETE FROM files_meta WHERE relative_path = ? OR relative_path LIKE ?', [sourcePath, `${sourcePrefix}%`]);

        for (const row of metaRows) {
          await db.run(`
            INSERT INTO files_meta (
              relative_path, title, description, is_public, access_password, share_id, expires_at, max_views, max_downloads, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            replacePathPrefix(row.relative_path, sourcePath, destinationPath),
            row.title ?? null,
            row.description ?? null,
            row.is_public ?? 0,
            row.access_password ?? null,
            row.share_id ?? null,
            row.expires_at ?? null,
            row.max_views ?? null,
            row.max_downloads ?? null,
            row.created_at ?? null,
            row.updated_at ?? null,
          ]);
        }
      }

      if (eventRows.length > 0) {
        await db.run('DELETE FROM file_events WHERE relative_path = ? OR relative_path LIKE ?', [sourcePath, `${sourcePrefix}%`]);

        for (const row of eventRows) {
          await db.run(
            'INSERT INTO file_events (relative_path, event_type, created_at) VALUES (?, ?, ?)',
            [replacePathPrefix(row.relative_path, sourcePath, destinationPath), row.event_type, row.created_at ?? null]
          );
        }
      }

      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  },

  // 路径复制时，复制描述信息，但重置公开状态、分享 ID、访问密码与统计数据
  clonePathRecords: async (sourcePath: string, destinationPath: string) => {
    const db = getDB();
    const sourcePrefix = `${sourcePath}/`;

    const metaRows = await db.all('SELECT * FROM files_meta WHERE relative_path = ? OR relative_path LIKE ?', [sourcePath, `${sourcePrefix}%`]);
    if (metaRows.length === 0) {
      return;
    }

    await db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of metaRows) {
        await db.run(`
          INSERT INTO files_meta (
            relative_path, title, description, is_public, access_password, share_id, expires_at, max_views, max_downloads, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          replacePathPrefix(row.relative_path, sourcePath, destinationPath),
          row.title ?? null,
          row.description ?? null,
          0,
          null,
          null,
          row.expires_at ?? null,
          row.max_views ?? null,
          row.max_downloads ?? null,
        ]);
      }

      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  },

  // 系统配置相关：更新管理员密码
  updateAdminPassword: async (newPassword: string) => {
    const db = getDB();
    return await db.run('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)', ['admin_password', newPassword]);
  },

  // 获取自定义管理员密码
  getAdminPassword: async (): Promise<string | null> => {
    const db = getDB();
    const row = await db.get('SELECT value FROM system_config WHERE key = ?', ['admin_password']);
    return row ? row.value : null;
  }
};
