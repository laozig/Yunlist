import { FastifyInstance } from 'fastify';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { getSecureFilePath, normalizeRelativePath } from '../utils/pathUtils';
import { getDB } from '../db';
import { FileMetaModel } from '../models/fileMeta';
import { TrashEntryModel } from '../models/trashEntry';
import { config } from '../config';
import fastifyMultipart from '@fastify/multipart';
import { sendArchiveReply } from '../utils/archive';

const INTERNAL_TRASH_DIR = '.trash';

function normalizeIncomingPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '';

  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '/' || trimmed === '.') return '';

  try {
    return normalizeRelativePath(decodeURIComponent(trimmed));
  } catch {
    return normalizeRelativePath(trimmed);
  }
}

function normalizeIncomingPaths(rawPaths: unknown): string[] {
  if (!Array.isArray(rawPaths)) return [];
  return Array.from(new Set(rawPaths.map(normalizeIncomingPath).filter(Boolean)));
}

function normalizeIncomingIds(rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) return [];
  return Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
}

function pruneNestedPaths(paths: string[]): string[] {
  const sorted = [...paths].sort((a, b) => a.length - b.length);
  return sorted.filter((candidate, index) => {
    return !sorted.some((parent, parentIndex) => {
      if (parentIndex === index) return false;
      return candidate.startsWith(parent + '/');
    });
  });
}

function isManagedInternalPath(relativePath: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  return normalizedPath === INTERNAL_TRASH_DIR || normalizedPath.startsWith(`${INTERNAL_TRASH_DIR}/`);
}

function ensureManagedPublicPath(relativePath: string) {
  if (isManagedInternalPath(relativePath)) {
    throw new Error('系统保留目录不可直接操作');
  }
}

function parseNullableInteger(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('次数限制必须是大于等于 0 的整数');
  }

  return parsed;
}

function parseNullableDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('过期时间格式不正确');
  }

  return date.toISOString();
}

function hasOwnProperty(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function getParentRelativePath(relativePath: string): string {
  const parentPath = path.posix.dirname(relativePath);
  return parentPath === '.' ? '' : normalizeRelativePath(parentPath);
}

function buildDestinationPath(sourcePath: string, destinationDir: string): string {
  return normalizeRelativePath(path.posix.join(destinationDir, path.posix.basename(sourcePath)));
}

function isSubPath(candidate: string, rootPath: string): boolean {
  if (!rootPath) return true;
  return candidate === rootPath || candidate.startsWith(rootPath + '/');
}

async function deleteManagedPath(relativePath: string) {
  if (!relativePath) {
    throw new Error('不支持直接删除根目录');
  }

  ensureManagedPublicPath(relativePath);
  const targetPath = getSecureFilePath(relativePath);

  if (!fs.existsSync(targetPath)) {
    await FileMetaModel.deleteByPath(relativePath);
    return;
  }

  const stat = await fs.promises.lstat(targetPath);
  const { metaRows, eventRows } = await FileMetaModel.exportPathRecords(relativePath);
  const trashId = randomUUID();
  const trashRelativePath = normalizeRelativePath(path.posix.join(INTERNAL_TRASH_DIR, `${trashId}-${path.posix.basename(relativePath)}`));
  const trashPath = getSecureFilePath(trashRelativePath);

  await fs.promises.mkdir(path.dirname(trashPath), { recursive: true });
  await fs.promises.rename(targetPath, trashPath);

  try {
    await TrashEntryModel.create({
      id: trashId,
      original_path: relativePath,
      trash_path: trashRelativePath,
      item_name: path.posix.basename(relativePath),
      is_directory: stat.isDirectory(),
      size: stat.isDirectory() ? 0 : stat.size,
      meta_snapshot: JSON.stringify(metaRows),
      event_snapshot: JSON.stringify(eventRows),
    });

    await FileMetaModel.deleteByPath(relativePath);
  } catch (error) {
    await fs.promises.rename(trashPath, targetPath).catch(() => undefined);
    throw error;
  }
}

async function restoreTrashEntryById(id: string) {
  const entry = await TrashEntryModel.findById(id);
  if (!entry) {
    throw new Error('回收站记录不存在');
  }

  ensureManagedPublicPath(entry.original_path);
  const targetPath = getSecureFilePath(entry.original_path);
  const trashPath = getSecureFilePath(entry.trash_path);

  if (fs.existsSync(targetPath)) {
    throw new Error('原路径已被占用，请先手动处理冲突');
  }

  if (!fs.existsSync(trashPath)) {
    await TrashEntryModel.deleteById(id);
    throw new Error('回收站文件已丢失，记录已清理');
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.rename(trashPath, targetPath);

  try {
    await FileMetaModel.deleteByPath(entry.original_path);
    const metaRows = entry.meta_snapshot ? JSON.parse(entry.meta_snapshot) : [];
    const eventRows = entry.event_snapshot ? JSON.parse(entry.event_snapshot) : [];
    await FileMetaModel.restorePathRecords(metaRows, eventRows);
    await TrashEntryModel.deleteById(id);
    return entry.original_path;
  } catch (error) {
    await fs.promises.rename(targetPath, trashPath).catch(() => undefined);
    throw error;
  }
}

async function purgeTrashEntryById(id: string) {
  const entry = await TrashEntryModel.findById(id);
  if (!entry) {
    throw new Error('回收站记录不存在');
  }

  const trashPath = getSecureFilePath(entry.trash_path);
  if (fs.existsSync(trashPath)) {
    const stat = await fs.promises.lstat(trashPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(trashPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } else {
      await fs.promises.unlink(trashPath);
    }
  }

  await TrashEntryModel.deleteById(id);
}

async function readAppVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const raw = await fs.promises.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(raw);
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildActivityTrend(rawItems: any[], days: number) {
  const trendMap = new Map<string, { view_count: number; download_count: number }>();

  for (const item of rawItems) {
    const date = typeof item?.date === 'string' ? item.date : '';
    if (!date) continue;

    trendMap.set(date, {
      view_count: Number(item?.view_count ?? 0),
      download_count: Number(item?.download_count ?? 0),
    });
  }

  const points: Array<{ date: string; view_count: number; download_count: number; total: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - i);
    const key = formatDateKey(current);
    const matched = trendMap.get(key) ?? { view_count: 0, download_count: 0 };

    points.push({
      date: key,
      view_count: matched.view_count,
      download_count: matched.download_count,
      total: matched.view_count + matched.download_count,
    });
  }

  return points;
}

async function readDiskUsage(targetPath: string) {
  try {
    const fallbackTarget = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);
    const stat = await fs.promises.statfs(fallbackTarget);
    const blockSize = Number((stat as any).bsize ?? (stat as any).frsize ?? 0);
    const total = Number((stat as any).blocks ?? 0) * blockSize;
    const free = Number((stat as any).bavail ?? (stat as any).bfree ?? 0) * blockSize;
    const used = total > 0 ? Math.max(total - free, 0) : null;
    const usagePercent = total > 0 && used != null ? Number(((used / total) * 100).toFixed(2)) : null;

    return {
      total: total || null,
      free: free || null,
      used,
      usagePercent,
      blockSize: blockSize || null,
    };
  } catch {
    return {
      total: null,
      free: null,
      used: null,
      usagePercent: null,
      blockSize: null,
    };
  }
}

async function readDbHealth(dbExists: boolean) {
  if (!dbExists) {
    return {
      status: 'error',
      label: '数据库缺失',
      journalMode: null,
      message: '未检测到数据库文件，请检查 DB_PATH 是否正确。',
      updatedAt: null,
    } as const;
  }

  const updatedAt = (await fs.promises.stat(config.dbPath)).mtime.toISOString();

  try {
    const db = getDB();
    const quickCheckRow = await db.get('PRAGMA quick_check');
    const journalModeRow = await db.get('PRAGMA journal_mode');
    const quickCheck = typeof quickCheckRow?.quick_check === 'string' ? quickCheckRow.quick_check : 'unknown';
    const journalMode = typeof journalModeRow?.journal_mode === 'string' ? journalModeRow.journal_mode : null;

    if (quickCheck !== 'ok') {
      return {
        status: 'error',
        label: '数据库异常',
        journalMode,
        message: `完整性检查未通过：${quickCheck}`,
        updatedAt,
      } as const;
    }

    if (journalMode && journalMode.toLowerCase() !== 'wal') {
      return {
        status: 'warning',
        label: '数据库可用',
        journalMode,
        message: `数据库可读写，但当前 journal_mode 为 ${journalMode}，建议使用 WAL 模式。`,
        updatedAt,
      } as const;
    }

    return {
      status: 'healthy',
      label: '数据库健康',
      journalMode,
      message: '数据库读写正常，完整性检查通过。',
      updatedAt,
    } as const;
  } catch (error: any) {
    return {
      status: 'error',
      label: '数据库检测失败',
      journalMode: null,
      message: error?.message || '无法执行数据库健康检查。',
      updatedAt,
    } as const;
  }
}

export default async function adminRoutes(fastify: FastifyInstance) {
  // 注册 multipart 插件，以支持文件上传解析
  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 * 1024 // 限制最大为 10GB
    }
  });

  // 中间件：当前路由下的所有请求必须带有管理员鉴权 (JWT)
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized: Admin access required' });
    }
  });

  // 1. 读取目录列表
  fastify.get('/files', async (request, reply) => {
    const { dirPath = '' } = request.query as any;

    try {
      ensureManagedPublicPath(dirPath);
      const targetDir = getSecureFilePath(dirPath);

      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
         return reply.code(404).send({ error: 'Directory not found' });
      }

      const fileDirents = fs.readdirSync(targetDir, { withFileTypes: true }).filter((dirent) => dirent.name !== INTERNAL_TRASH_DIR);
      const files = await Promise.all(fileDirents.map(async (dirent) => {
        const relPath = normalizeRelativePath(path.posix.join(dirPath.replace(/\\/g, '/'), dirent.name));
        const metaInfo = await FileMetaModel.findByPath(relPath);
        const stat = fs.statSync(path.join(targetDir, dirent.name));

        return {
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          relativePath: relPath,
          size: dirent.isDirectory() ? 0 : stat.size,
          lastModified: stat.mtimeMs,
          metaInfo
        };
      }));

      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }

        return a.name.localeCompare(b.name, 'zh-CN');
      });

      return { files };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 2. 上传文件
  fastify.post('/upload', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: 'No file uploaded' });

      const targetDirField = data.fields.dirPath ? (data.fields.dirPath as any).value : '';
      ensureManagedPublicPath(targetDirField);

      const relativePathToSave = path.posix.join(targetDirField, data.filename);
      const destPath = getSecureFilePath(relativePathToSave);

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      await pipeline(data.file, fs.createWriteStream(destPath));

      return { success: true, relativePath: relativePathToSave };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 3. 删除文件或文件夹
  fastify.delete('/files', async (request, reply) => {
    const query = (request.query as any) ?? {};
    const body = (request.body as any) ?? {};
    const rawPath = body.filePath ?? query.filePath;
    const filePath = normalizeIncomingPath(rawPath);
    if (!filePath && rawPath !== '' && rawPath !== '/') return reply.code(400).send({ error: 'filePath is required' });

    try {
       await deleteManagedPath(filePath);

       return { success: true };
    } catch (e: any) {
      request.log.error({ err: e, rawPath, filePath }, '删除文件或文件夹失败');
      reply.code(400).send({ error: e.message });
    }
  });

  // 4. 编辑附加信息
  fastify.put('/meta', async (request, reply) => {
    const body = (request.body as any) ?? {};
    const { relativePath: rawPath } = body;
    const relativePath = normalizeRelativePath(rawPath);

    try {
      ensureManagedPublicPath(relativePath);
      const absoluteTarget = getSecureFilePath(relativePath);
      const targetExists = fs.existsSync(absoluteTarget);
      const existingMeta = await FileMetaModel.findByPath(relativePath);

      if (!targetExists) {
         // 兼容“物理文件已被删，但数据库里还残留分享记录”的情况：
         // 当请求是在关闭公开分享时，直接清理掉残留元数据，避免前端一直看到脏数据。
         if (body.isPublic === false) {
           await FileMetaModel.deleteByPath(relativePath);
           return { success: true, cleanedStaleMeta: true };
         }

         return reply.code(404).send({ error: 'Target physical file does not exist' });
      }

      const nextExpiresAt = parseNullableDate(body.expiresAt);
      const nextMaxViews = parseNullableInteger(body.maxViews);
      const nextMaxDownloads = parseNullableInteger(body.maxDownloads);

      await FileMetaModel.upsert({
        relative_path: relativePath,
        title: hasOwnProperty(body, 'title') ? body.title ?? null : existingMeta?.title ?? null,
        description: hasOwnProperty(body, 'description') ? body.description ?? null : existingMeta?.description ?? null,
        is_public: hasOwnProperty(body, 'isPublic') ? !!body.isPublic : existingMeta?.is_public ?? false,
        access_password: hasOwnProperty(body, 'accessPassword') ? (body.accessPassword || null) : existingMeta?.access_password ?? null,
        share_id: hasOwnProperty(body, 'shareId') ? (body.shareId || null) : existingMeta?.share_id ?? null,
        expires_at: nextExpiresAt === undefined ? existingMeta?.expires_at ?? null : nextExpiresAt,
        max_views: nextMaxViews === undefined ? existingMeta?.max_views ?? null : nextMaxViews,
        max_downloads: nextMaxDownloads === undefined ? existingMeta?.max_downloads ?? null : nextMaxDownloads,
      });

      return { success: true };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5. 获取所有已分享文件清单
  fastify.get('/shared', async () => {
    const sharedFiles = await FileMetaModel.findAllShared();

    const existingFiles = await Promise.all(sharedFiles.map(async (file) => {
      try {
        const absoluteTarget = getSecureFilePath(file.relative_path);
        if (!fs.existsSync(absoluteTarget)) {
          await FileMetaModel.deleteByPath(file.relative_path);
          return null;
        }

        return file;
      } catch {
        await FileMetaModel.deleteByPath(file.relative_path);
        return null;
      }
    }));

    return { files: existingFiles.filter(Boolean) };
  });

  // 5.0 回收站列表
  fastify.get('/trash', async () => {
    const items = await TrashEntryModel.listAll();
    return { items };
  });

  // 5.0.1 恢复回收站文件
  fastify.post('/trash/:id/restore', async (request, reply) => {
    const { id } = request.params as any;

    try {
      const restoredPath = await restoreTrashEntryById(id);
      return { success: true, relativePath: restoredPath };
    } catch (e: any) {
      reply.code(e.message === '回收站记录不存在' || e.message === '回收站文件已丢失，记录已清理' ? 404 : 400).send({ error: e.message });
    }
  });

  // 5.0.2 彻底删除回收站文件
  fastify.delete('/trash/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      await purgeTrashEntryById(id);
      return { success: true };
    } catch (e: any) {
      reply.code(e.message === '回收站记录不存在' ? 404 : 400).send({ error: e.message });
    }
  });

  fastify.post('/trash/batch/restore', async (request, reply) => {
    const ids = normalizeIncomingIds((request.body as any)?.ids);
    if (ids.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一条回收站记录' });
    }

    const restored: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        restored.push(await restoreTrashEntryById(id));
      } catch (error: any) {
        failed.push({ id, error: error.message || '恢复失败' });
      }
    }

    return { success: failed.length === 0, restored, failed };
  });

  fastify.post('/trash/batch/delete', async (request, reply) => {
    const ids = normalizeIncomingIds((request.body as any)?.ids);
    if (ids.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一条回收站记录' });
    }

    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        await purgeTrashEntryById(id);
        deleted.push(id);
      } catch (error: any) {
        failed.push({ id, error: error.message || '删除失败' });
      }
    }

    return { success: failed.length === 0, deleted, failed };
  });

  // 5.1 批量切换分享状态
  fastify.post('/batch/share', async (request, reply) => {
    const { paths: rawPaths, isPublic } = (request.body as any) ?? {};
    const paths = pruneNestedPaths(normalizeIncomingPaths(rawPaths));

    if (paths.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一个文件或文件夹' });
    }

    if (typeof isPublic !== 'boolean') {
      return reply.code(400).send({ error: 'isPublic 必须为布尔值' });
    }

    try {
      const failedPaths: string[] = [];

      for (const relativePath of paths) {
        if (!relativePath) {
          failedPaths.push('根目录');
          continue;
        }

        ensureManagedPublicPath(relativePath);
        const absoluteTarget = getSecureFilePath(relativePath);
        const exists = fs.existsSync(absoluteTarget);

        if (!exists) {
          if (!isPublic) {
            await FileMetaModel.deleteByPath(relativePath);
            continue;
          }

          failedPaths.push(relativePath);
          continue;
        }

        const existingMeta = await FileMetaModel.findByPath(relativePath);
        await FileMetaModel.upsert({
          relative_path: relativePath,
          title: existingMeta?.title ?? null,
          description: existingMeta?.description ?? null,
          is_public: isPublic,
          access_password: existingMeta?.access_password ?? null,
          share_id: existingMeta?.share_id ?? null,
          expires_at: existingMeta?.expires_at ?? null,
          max_views: existingMeta?.max_views ?? null,
          max_downloads: existingMeta?.max_downloads ?? null,
        });
      }

      if (failedPaths.length > 0) {
        return reply.code(400).send({ error: `以下路径不存在，无法更新分享状态：${failedPaths.join(', ')}` });
      }

      return { success: true, count: paths.length };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.2 批量删除
  fastify.post('/batch/delete', async (request, reply) => {
    const paths = pruneNestedPaths(normalizeIncomingPaths((request.body as any)?.paths));
    if (paths.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一个文件或文件夹' });
    }

    try {
      const sortedPaths = [...paths].sort((a, b) => b.length - a.length);
      for (const relativePath of sortedPaths) {
        await deleteManagedPath(relativePath);
      }

      return { success: true, count: sortedPaths.length };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.3 重命名文件/文件夹
  fastify.post('/rename', async (request, reply) => {
    const { sourcePath: rawSourcePath, newName } = (request.body as any) ?? {};
    const sourcePath = normalizeIncomingPath(rawSourcePath);

    if (!sourcePath) {
      return reply.code(400).send({ error: 'sourcePath is required' });
    }

    const safeNewName = typeof newName === 'string' ? newName.trim() : '';
    if (!safeNewName || safeNewName.includes('/') || safeNewName.includes('\\')) {
      return reply.code(400).send({ error: 'newName 非法，不能包含路径分隔符' });
    }

    const destinationPath = normalizeRelativePath(path.posix.join(getParentRelativePath(sourcePath), safeNewName));
    if (!destinationPath || destinationPath === sourcePath) {
      return { success: true, relativePath: sourcePath };
    }

    try {
      ensureManagedPublicPath(sourcePath);
      ensureManagedPublicPath(destinationPath);
      const sourceAbsolutePath = getSecureFilePath(sourcePath);
      const destinationAbsolutePath = getSecureFilePath(destinationPath);

      if (!fs.existsSync(sourceAbsolutePath)) {
        return reply.code(404).send({ error: '源文件或文件夹不存在' });
      }

      if (fs.existsSync(destinationAbsolutePath)) {
        return reply.code(400).send({ error: '目标名称已存在' });
      }

      await FileMetaModel.deleteByPath(destinationPath);
      await fs.promises.rename(sourceAbsolutePath, destinationAbsolutePath);
      await FileMetaModel.movePathRecords(sourcePath, destinationPath);

      return { success: true, relativePath: destinationPath };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.4 移动文件/文件夹
  fastify.post('/move', async (request, reply) => {
    const body = (request.body as any) ?? {};
    const sourcePaths = pruneNestedPaths(normalizeIncomingPaths(body.sourcePaths));
    const destinationDir = normalizeIncomingPath(body.destinationDir);

    if (sourcePaths.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一个文件或文件夹' });
    }

    try {
      ensureManagedPublicPath(destinationDir);
      const destinationAbsoluteDir = getSecureFilePath(destinationDir);
      if (!fs.existsSync(destinationAbsoluteDir) || !fs.statSync(destinationAbsoluteDir).isDirectory()) {
        return reply.code(404).send({ error: '目标目录不存在' });
      }

      const plannedPaths = new Set<string>();
      for (const sourcePath of sourcePaths) {
        ensureManagedPublicPath(sourcePath);
        if (!sourcePath) {
          return reply.code(400).send({ error: '不支持移动根目录' });
        }

        const destinationPath = buildDestinationPath(sourcePath, destinationDir);
        ensureManagedPublicPath(destinationPath);
        if (isSubPath(destinationDir, sourcePath)) {
          return reply.code(400).send({ error: `不能把文件夹移动到其自身内部：${sourcePath}` });
        }

        if (plannedPaths.has(destinationPath)) {
          return reply.code(400).send({ error: `存在重复目标路径：${destinationPath}` });
        }
        plannedPaths.add(destinationPath);

        const destinationAbsolutePath = getSecureFilePath(destinationPath);
        if (fs.existsSync(destinationAbsolutePath) && destinationPath !== sourcePath) {
          return reply.code(400).send({ error: `目标已存在：${destinationPath}` });
        }
      }

      const moved: string[] = [];
      for (const sourcePath of sourcePaths) {
        const destinationPath = buildDestinationPath(sourcePath, destinationDir);
        if (destinationPath === sourcePath) continue;

        await FileMetaModel.deleteByPath(destinationPath);
        await fs.promises.rename(getSecureFilePath(sourcePath), getSecureFilePath(destinationPath));
        await FileMetaModel.movePathRecords(sourcePath, destinationPath);
        moved.push(destinationPath);
      }

      return { success: true, moved };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.5 复制文件/文件夹
  fastify.post('/copy', async (request, reply) => {
    const body = (request.body as any) ?? {};
    const sourcePaths = pruneNestedPaths(normalizeIncomingPaths(body.sourcePaths));
    const destinationDir = normalizeIncomingPath(body.destinationDir);

    if (sourcePaths.length === 0) {
      return reply.code(400).send({ error: '至少需要选择一个文件或文件夹' });
    }

    try {
      ensureManagedPublicPath(destinationDir);
      const destinationAbsoluteDir = getSecureFilePath(destinationDir);
      if (!fs.existsSync(destinationAbsoluteDir) || !fs.statSync(destinationAbsoluteDir).isDirectory()) {
        return reply.code(404).send({ error: '目标目录不存在' });
      }

      const plannedPaths = new Set<string>();
      for (const sourcePath of sourcePaths) {
        ensureManagedPublicPath(sourcePath);
        const destinationPath = buildDestinationPath(sourcePath, destinationDir);
        ensureManagedPublicPath(destinationPath);
        if (isSubPath(destinationDir, sourcePath)) {
          return reply.code(400).send({ error: `不能复制到其自身内部：${sourcePath}` });
        }

        if (plannedPaths.has(destinationPath)) {
          return reply.code(400).send({ error: `存在重复目标路径：${destinationPath}` });
        }
        plannedPaths.add(destinationPath);

        const destinationAbsolutePath = getSecureFilePath(destinationPath);
        if (fs.existsSync(destinationAbsolutePath)) {
          return reply.code(400).send({ error: `目标已存在：${destinationPath}` });
        }
      }

      const copied: string[] = [];
      for (const sourcePath of sourcePaths) {
        const destinationPath = buildDestinationPath(sourcePath, destinationDir);
        await FileMetaModel.deleteByPath(destinationPath);
        await fs.promises.cp(getSecureFilePath(sourcePath), getSecureFilePath(destinationPath), {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
        await FileMetaModel.clonePathRecords(sourcePath, destinationPath);
        copied.push(destinationPath);
      }

      return { success: true, copied };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.6 管理端打包下载
  fastify.post('/archive', async (request, reply) => {
    const filePath = normalizeIncomingPath((request.body as any)?.filePath);
    if (!filePath) {
      return reply.code(400).send({ error: 'filePath is required' });
    }

    try {
      ensureManagedPublicPath(filePath);
      const targetPath = getSecureFilePath(filePath);
      if (!fs.existsSync(targetPath)) {
        return reply.code(404).send({ error: '文件或文件夹不存在' });
      }

      return await sendArchiveReply(reply, targetPath);
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5.7 访问审计日志
  fastify.get('/audit/logs', async (request) => {
    const query = (request.query as any) ?? {};
    const rawLimit = Number(query.limit ?? 100);
    const rawOffset = Number(query.offset ?? 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const eventType = query.eventType === 'view' || query.eventType === 'download' ? query.eventType : undefined;
    const accessScope = typeof query.accessScope === 'string' && query.accessScope.trim() ? query.accessScope.trim() : undefined;
    const keyword = typeof query.keyword === 'string' ? query.keyword : undefined;

    const { items, total } = await FileMetaModel.getRecentEvents({
      limit,
      offset,
      eventType,
      accessScope,
      keyword,
    });

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  });

  // 6. 获取系统运行状态
  fastify.get('/system-stats', async () => {
    const trendDays = 7;
    const rootExists = fs.existsSync(config.filesRoot);
    const dbExists = fs.existsSync(config.dbPath);
    const frontendIndexPath = path.join(config.frontendDistPath, 'index.html');
    const frontendIndexExists = fs.existsSync(frontendIndexPath);
    const appVersion = await readAppVersion();
    const sharedCount = (await FileMetaModel.findAllShared()).length;
    const trashCount = (await TrashEntryModel.listAll()).length;
    const activityStats = await FileMetaModel.getGlobalStats(trendDays);
    const activityTrend = buildActivityTrend(activityStats, trendDays);
    const recentActivity = activityTrend.reduce((sum: number, item: any) => {
      return sum + Number(item?.view_count ?? 0) + Number(item?.download_count ?? 0);
    }, 0);
    const dbSize = dbExists ? (await fs.promises.stat(config.dbPath)).size : 0;
    const totalSystemMemory = os.totalmem();
    const freeSystemMemory = os.freemem();
    const cpuInfo = os.cpus();
    const disk = await readDiskUsage(config.filesRoot);
    const dbHealth = await readDbHealth(dbExists);
    const deploymentMode = process.env.pm_id != null
      ? 'pm2'
      : fs.existsSync('/.dockerenv')
        ? 'docker'
        : 'node';

    const stats = {
      appVersion,
      deploymentMode,
      rootPath: path.resolve(config.filesRoot),
      dbPath: path.resolve(config.dbPath),
      frontendDistPath: path.resolve(config.frontendDistPath),
      frontendIndexExists,
      dbExists,
      dbSize,
      rootExists,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      pid: process.pid,
      cwd: process.cwd(),
      uptime: process.uptime(),
      osUptime: os.uptime(),
      memoryUsage: process.memoryUsage(),
      systemMemory: {
        total: totalSystemMemory,
        free: freeSystemMemory,
        used: totalSystemMemory - freeSystemMemory,
      },
      cpu: {
        model: cpuInfo[0]?.model ?? 'Unknown CPU',
        cores: cpuInfo.length,
        loadavg: os.loadavg(),
      },
      counters: {
        sharedCount,
        trashCount,
        recentActivity,
        auditEventDays: trendDays,
      },
      disk,
      activityTrend,
      dbHealth,
      runtime: {
        env: process.env.NODE_ENV ?? 'development',
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        pm2Id: process.env.pm_id != null ? Number(process.env.pm_id) : null,
        port: config.port,
        caddyDomain: process.env.CADDY_DOMAIN ?? null,
      },
    };
    return stats;
  });

  // 7. 修改管理员密码
  fastify.put('/password', async (request, reply) => {
    const { oldPassword, newPassword } = request.body as any;

    const currentStored = await FileMetaModel.getAdminPassword();
    const currentEffective = currentStored || config.adminPassword;

    if (oldPassword !== currentEffective) {
      return reply.code(403).send({ error: '旧密码输入有误' });
    }

    await FileMetaModel.updateAdminPassword(newPassword);
    return { success: true };
  });

  // 8. 获取全局统计数据与热门列表
  fastify.get('/stats', async () => {
    const dashboard = await FileMetaModel.getGlobalStats(14);
    const hotFiles = await FileMetaModel.getHotFiles(10);
    return { dashboard, hotFiles };
  });

  // 9. 新建文件夹
  fastify.post('/mkdir', async (request, reply) => {
    const { dirPath: rawDirPath, name } = request.body as any;
    const dirPath = normalizeRelativePath(rawDirPath);
    if (!name) return reply.code(400).send({ error: 'Folder name is required' });

    try {
      const fullPath = path.posix.join(dirPath || '', name);
      ensureManagedPublicPath(fullPath);
      const physicalPath = getSecureFilePath(fullPath);

      if (fs.existsSync(physicalPath)) {
        return reply.code(400).send({ error: 'Folder or file already exists' });
      }

      fs.mkdirSync(physicalPath, { recursive: true });
      return { success: true };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });
}
