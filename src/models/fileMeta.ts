import { getDB } from '../db';

// 核心数据表模型定义
export interface FileMeta {
  relative_path: string; // 文件相对路径 (作为唯一键)
  title: string | null; // 自定义标题
  description: string | null; // 详细介绍说明 (支持 Markdown)
  is_public: boolean; // 分享状态 (是否公开)
  access_password?: string | null; // 访问密码 (可选)
  share_id?: string | null; // 自定义分享 ID (短后缀)
  created_at?: string;
  updated_at?: string;
}

export const FileMetaModel = {
  // 获取文件扩展信息
  findByPath: async (relativePath: string): Promise<FileMeta | undefined> => {
    const db = getDB();
    const row = await db.get('SELECT * FROM files_meta WHERE relative_path = ?', [relativePath]);
    if (!row) return undefined;
    
    return {
      ...row,
      is_public: row.is_public === 1
    } as FileMeta;
  },

  // 通过分享 ID 查找文件
  findByShareId: async (shareId: string): Promise<FileMeta | undefined> => {
    const db = getDB();
    const row = await db.get('SELECT * FROM files_meta WHERE share_id = ?', [shareId]);
    if (!row) return undefined;
    
    return {
      ...row,
      is_public: row.is_public === 1
    } as FileMeta;
  },

  // 获取所有公开分享的文件
  findAllShared: async (): Promise<FileMeta[]> => {
    const db = getDB();
    // 关联统计点击数和下载数（可选，此处为了性能先保持简单）
    const rows = await db.all('SELECT * FROM files_meta WHERE is_public = 1 ORDER BY updated_at DESC');
    return rows.map(row => ({
      ...row,
      is_public: row.is_public === 1
    })) as FileMeta[];
  },

  // 插入或更新文件扩展信息
  upsert: async (meta: FileMeta) => {
    const db = getDB();
    const query = `
      INSERT INTO files_meta (
        relative_path, title, description, is_public, access_password, share_id, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        is_public = excluded.is_public,
        access_password = excluded.access_password,
        share_id = excluded.share_id,
        updated_at = CURRENT_TIMESTAMP
    `;

    return await db.run(query, [
      meta.relative_path,
      meta.title || null,
      meta.description || null,
      meta.is_public ? 1 : 0,
      meta.access_password || null,
      meta.share_id || null
    ]);
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
