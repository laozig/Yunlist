import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getSecureFilePath, normalizeRelativePath } from '../utils/pathUtils';
import { FileMetaModel } from '../models/fileMeta';

/** 判断 childPath 是否在 parentPath 范围内（路径段级别，不是字符串前缀） */
function isWithinSharedRoot(childPath: string, parentPath: string): boolean {
  if (childPath === parentPath) return true;
  return childPath.startsWith(parentPath + '/');
}

export default async function shareRoutes(fastify: FastifyInstance) {
  // 获取分享文件的公开信息
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { p = '' } = request.query as any;

    try {
      let meta: any = await FileMetaModel.findByShareId(id);
      let sharedRootPath = '';

      if (meta) {
        sharedRootPath = meta.relative_path;
      } else {
        try {
          const decodedPath = decodeURIComponent(Buffer.from(id, 'base64').toString('utf8'));
          sharedRootPath = normalizeRelativePath(decodedPath);
          meta = await FileMetaModel.findByPath(sharedRootPath);
        } catch (e) {
          return reply.code(404).send({ error: 'Shared content not found' });
        }
      }

      if (!meta || !meta.is_public) {
        return reply.code(404).send({ error: '分享文件不存在或已关闭公开访问' });
      }

      // 构造最终物理路径，支持子路径漫游
      const currentRelPath = normalizeRelativePath(path.posix.join(sharedRootPath, p));

      // 安全校验：路径段级别判断，防止字符串前缀误匹配
      if (!isWithinSharedRoot(currentRelPath, sharedRootPath)) {
        return reply.code(403).send({ error: 'Access denied: out of shared scope' });
      }

      if (!p) {
        await FileMetaModel.logEvent(sharedRootPath, 'view');
      }

      const targetPath = getSecureFilePath(currentRelPath);
      let size = 0;
      let name = path.basename(targetPath);
      let isDirectory = false;
      let children: any[] = [];

      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        isDirectory = stats.isDirectory();
        size = isDirectory ? 0 : stats.size;

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
              size: item.isDirectory() ? 0 : childStat.size,
            });
          }
        }
      } else {
        return reply.code(404).send({ error: '物理文件不存在' });
      }

      return {
        meta: {
          title: meta.title,
          description: meta.description,
          access_password: meta.access_password ? true : false, // 不暴露密码内容
          share_id: meta.share_id,
        },
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

  // 下载分享文件
  fastify.get('/:id/download', async (request, reply) => {
    const { id } = request.params as any;
    const { p = '', password = '' } = request.query as any;

    try {
      let meta: any = await FileMetaModel.findByShareId(id);
      let sharedRootPath = '';

      if (meta) {
        sharedRootPath = meta.relative_path;
      } else {
        try {
          const decodedPath = decodeURIComponent(Buffer.from(id, 'base64').toString('utf8'));
          sharedRootPath = normalizeRelativePath(decodedPath);
          meta = await FileMetaModel.findByPath(sharedRootPath);
        } catch (e) {}
      }

      if (!meta || !meta.is_public) {
        return reply.code(404).send({ error: '分享文件不存在' });
      }

      if (meta.access_password && meta.access_password !== password) {
        return reply.code(403).send({ error: '密码错误' });
      }

      const finalRelPath = normalizeRelativePath(path.posix.join(sharedRootPath, p));

      // 安全校验：路径段级别判断
      if (!isWithinSharedRoot(finalRelPath, sharedRootPath)) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      await FileMetaModel.logEvent(sharedRootPath, 'download');

      const targetPath = getSecureFilePath(finalRelPath);
      if (!fs.existsSync(targetPath)) {
        return reply.code(404).send({ error: '物理文件已丢失' });
      }

      if (fs.statSync(targetPath).isDirectory()) {
        return reply.code(400).send({ error: '无法直接下载文件夹，请尝试打包下载（功能开发中）' });
      }

      const name = path.basename(targetPath);
      const stream = fs.createReadStream(targetPath);

      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
      return reply.send(stream);
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });
}
