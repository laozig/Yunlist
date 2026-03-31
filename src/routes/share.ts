import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getSecureFilePath, normalizeRelativePath } from '../utils/pathUtils';
import { FileMetaModel, type FileMeta } from '../models/fileMeta';
import { sendArchiveReply } from '../utils/archive';

/** 判断 childPath 是否在 parentPath 范围内（路径段级别，不是字符串前缀） */
function isWithinSharedRoot(childPath: string, parentPath: string): boolean {
  if (!parentPath) return true;
  if (childPath === parentPath) return true;
  return childPath.startsWith(parentPath + '/');
}

/** 将任意路径转换为“相对于分享根目录”的子路径 */
function toShareRelativePath(targetPath: string, sharedRootPath: string): string {
  const normalizedTarget = normalizeRelativePath(targetPath);
  const normalizedSharedRoot = normalizeRelativePath(sharedRootPath);

  if (!normalizedSharedRoot) return normalizedTarget;
  if (normalizedTarget === normalizedSharedRoot) return '';

  if (normalizedTarget.startsWith(normalizedSharedRoot + '/')) {
    return normalizeRelativePath(normalizedTarget.slice(normalizedSharedRoot.length + 1));
  }

  return normalizedTarget;
}

async function resolveSharedTarget(id: string): Promise<{ meta: FileMeta; sharedRootPath: string } | null> {
  let meta = await FileMetaModel.findByShareId(id);
  let sharedRootPath = '';

  if (meta) {
    sharedRootPath = meta.relative_path;
  } else {
    try {
      const decodedPath = decodeURIComponent(Buffer.from(id, 'base64').toString('utf8'));
      sharedRootPath = normalizeRelativePath(decodedPath);
      meta = await FileMetaModel.findByPath(sharedRootPath);
    } catch (e) {
      return null;
    }
  }

  if (!meta || !meta.is_public) {
    return null;
  }

  return { meta, sharedRootPath };
}

function buildCurrentRelativePath(sharedRootPath: string, requestedPath: string): string {
  const subPath = toShareRelativePath(requestedPath, sharedRootPath);
  return normalizeRelativePath(path.posix.join(sharedRootPath, subPath));
}

function getShareAccessState(meta: FileMeta) {
  const views = meta.views ?? 0;
  const downloads = meta.downloads ?? 0;
  const isExpired = !!meta.expires_at && new Date(meta.expires_at).getTime() <= Date.now();
  const viewLimitReached = meta.max_views != null && views >= meta.max_views;
  const downloadLimitReached = meta.max_downloads != null && downloads >= meta.max_downloads;

  return {
    isExpired,
    viewLimitReached,
    downloadLimitReached,
    views,
    downloads,
    remainingViews: meta.max_views == null ? null : Math.max(meta.max_views - views, 0),
    remainingDownloads: meta.max_downloads == null ? null : Math.max(meta.max_downloads - downloads, 0),
  };
}

function getShareRestrictionMessage(
  accessState: ReturnType<typeof getShareAccessState>,
  scope: 'info' | 'download'
): string | null {
  if (accessState.isExpired) {
    return '该分享已过期';
  }

  if (scope === 'info' && accessState.viewLimitReached) {
    return '该分享访问次数已达上限';
  }

  if (scope === 'download' && accessState.downloadLimitReached) {
    return '该分享下载次数已达上限';
  }

  return null;
}

function getRequestAuditDetails(request: any, accessScope: string) {
  const rawUserAgent = request.headers?.['user-agent'];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof rawUserAgent === 'string' ? rawUserAgent : null,
    accessScope,
  };
}

export default async function shareRoutes(fastify: FastifyInstance) {
  // 获取分享文件的公开信息
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { p = '' } = request.query as any;

    try {
      const sharedTarget = await resolveSharedTarget(id);
      if (!sharedTarget) {
        return reply.code(404).send({ error: '分享文件不存在或已关闭公开访问' });
      }

      const { meta, sharedRootPath } = sharedTarget;
      const accessState = getShareAccessState(meta);
      const restrictionMessage = getShareRestrictionMessage(accessState, 'info');
      if (restrictionMessage) {
        return reply.code(410).send({ error: restrictionMessage });
      }

      const currentPath = toShareRelativePath(p, sharedRootPath);

      // 构造最终物理路径，支持子路径漫游
      const currentRelPath = buildCurrentRelativePath(sharedRootPath, currentPath);

      // 安全校验：路径段级别判断，防止字符串前缀误匹配
      if (!isWithinSharedRoot(currentRelPath, sharedRootPath)) {
        return reply.code(403).send({ error: 'Access denied: out of shared scope' });
      }

      if (!currentPath) {
        await FileMetaModel.logEvent(sharedRootPath, 'view', getRequestAuditDetails(request, 'share:view'));
        accessState.views += 1;
        if (accessState.remainingViews != null) {
          accessState.remainingViews = Math.max(accessState.remainingViews - 1, 0);
        }
      }

      const targetPath = getSecureFilePath(currentRelPath);
      if (!fs.existsSync(targetPath)) {
        return reply.code(404).send({ error: '物理文件不存在' });
      }

      const stats = fs.statSync(targetPath);
      const isDirectory = stats.isDirectory();
      const size = isDirectory ? 0 : stats.size;
      const name = path.basename(targetPath);
      const updated_at = stats.mtime.toISOString();
      const children: Array<{
        name: string;
        isDirectory: boolean;
        relativePath: string;
        relPath: string;
        size: number;
        updated_at: string;
      }> = [];

      if (isDirectory) {
        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        for (const item of items) {
          const childRelPath = normalizeRelativePath(path.posix.join(currentRelPath, item.name));
          const childAbsPath = path.join(targetPath, item.name);
          const childStat = fs.statSync(childAbsPath);
          children.push({
            name: item.name,
            isDirectory: item.isDirectory(),
            relativePath: childRelPath,
            relPath: toShareRelativePath(childRelPath, sharedRootPath),
            size: item.isDirectory() ? 0 : childStat.size,
            updated_at: childStat.mtime.toISOString(),
          });
        }

        children.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }

          return a.name.localeCompare(b.name, 'zh-CN');
        });
      }

      return {
        id,
        title: meta.title,
        description: meta.description,
        needsPassword: !!meta.access_password,
        shareId: meta.share_id ?? null,
        expiresAt: meta.expires_at ?? null,
        maxViews: meta.max_views ?? null,
        maxDownloads: meta.max_downloads ?? null,
        views: accessState.views,
        downloads: accessState.downloads,
        remainingViews: accessState.remainingViews,
        remainingDownloads: accessState.remainingDownloads,
        meta: {
          title: meta.title,
          description: meta.description,
          access_password: meta.access_password ? true : false, // 不暴露密码内容
          share_id: meta.share_id,
        },
        name,
        size,
        isDirectory,
        currentPath,
        updated_at,
        relativePath: currentRelPath,
        children,
        file: {
          name,
          isDirectory,
          size,
          relativePath: currentRelPath,
          children,
        },
        sharedRootPath,
      };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  const downloadSharedFile = async (request: any, reply: any, payload: any) => {
    const { id } = request.params as any;
    const { p = '', password = '' } = payload ?? {};

    try {
      const sharedTarget = await resolveSharedTarget(id);
      if (!sharedTarget) {
        return reply.code(404).send({ error: '分享文件不存在' });
      }

      const { meta, sharedRootPath } = sharedTarget;
      const accessState = getShareAccessState(meta);
      const restrictionMessage = getShareRestrictionMessage(accessState, 'download');
      if (restrictionMessage) {
        return reply.code(410).send({ error: restrictionMessage });
      }

      if (meta.access_password && meta.access_password !== password) {
        return reply.code(403).send({ error: '密码错误' });
      }

      const finalRelPath = buildCurrentRelativePath(sharedRootPath, p);

      // 安全校验：路径段级别判断
      if (!isWithinSharedRoot(finalRelPath, sharedRootPath)) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      await FileMetaModel.logEvent(sharedRootPath, 'download', getRequestAuditDetails(request, 'share:download'));

      const targetPath = getSecureFilePath(finalRelPath);
      if (!fs.existsSync(targetPath)) {
        return reply.code(404).send({ error: '物理文件已丢失' });
      }

      if (fs.statSync(targetPath).isDirectory()) {
        return reply.code(400).send({ error: '无法直接下载文件夹，请尝试打包下载（功能开发中）' });
      }

      const name = path.basename(targetPath);
      const stream = fs.createReadStream(targetPath);

      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      return reply.send(stream);
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  };

  // 下载分享文件
  fastify.get('/:id/download', async (request, reply) => {
    return downloadSharedFile(request, reply, request.query as any);
  });

  // 兼容前端使用 JSON Body 发起下载请求
  fastify.post('/:id/download', async (request, reply) => {
    return downloadSharedFile(request, reply, request.body as any);
  });

  const archiveSharedFile = async (request: any, reply: any, payload: any) => {
    const { id } = request.params as any;
    const { p = '', password = '' } = payload ?? {};

    try {
      const sharedTarget = await resolveSharedTarget(id);
      if (!sharedTarget) {
        return reply.code(404).send({ error: '分享文件不存在' });
      }

      const { meta, sharedRootPath } = sharedTarget;
      const accessState = getShareAccessState(meta);
      const restrictionMessage = getShareRestrictionMessage(accessState, 'download');
      if (restrictionMessage) {
        return reply.code(410).send({ error: restrictionMessage });
      }

      if (meta.access_password && meta.access_password !== password) {
        return reply.code(403).send({ error: '密码错误' });
      }

      const finalRelPath = buildCurrentRelativePath(sharedRootPath, p);
      if (!isWithinSharedRoot(finalRelPath, sharedRootPath)) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const targetPath = getSecureFilePath(finalRelPath);
      if (!fs.existsSync(targetPath)) {
        return reply.code(404).send({ error: '物理文件已丢失' });
      }

      await FileMetaModel.logEvent(sharedRootPath, 'download', getRequestAuditDetails(request, 'share:archive'));
      return await sendArchiveReply(reply, targetPath);
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  };

  fastify.get('/:id/archive', async (request, reply) => {
    return archiveSharedFile(request, reply, request.query as any);
  });

  fastify.post('/:id/archive', async (request, reply) => {
    return archiveSharedFile(request, reply, request.body as any);
  });
}
