import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { getSecureFilePath, normalizeRelativePath } from '../utils/pathUtils';
import { FileMetaModel } from '../models/fileMeta';
import { config } from '../config';
import fastifyMultipart from '@fastify/multipart';

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
      const targetDir = getSecureFilePath(dirPath);

      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
         return reply.code(404).send({ error: 'Directory not found' });
      }

      const fileDirents = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = await Promise.all(fileDirents.map(async (dirent) => {
        const relPath = normalizeRelativePath(path.posix.join(dirPath.replace(/\\/g, '/'), dirent.name));
        const metaInfo = await FileMetaModel.findByPath(relPath);

        return {
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          relativePath: relPath,
          size: dirent.isDirectory() ? 0 : fs.statSync(path.join(targetDir, dirent.name)).size,
          metaInfo
        };
      }));

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
    const { filePath: rawPath } = request.query as any;
    const filePath = normalizeRelativePath(rawPath);
    if (!filePath && rawPath !== '' && rawPath !== '/') return reply.code(400).send({ error: 'filePath is required' });

    try {
       const targetPath = getSecureFilePath(filePath);

       if (fs.existsSync(targetPath)) {
         if (fs.statSync(targetPath).isDirectory()) {
           fs.rmSync(targetPath, { recursive: true, force: true });
         } else {
           fs.unlinkSync(targetPath);
         }
       }

       await FileMetaModel.deleteByPath(filePath);

       return { success: true };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 4. 编辑附加信息
  fastify.put('/meta', async (request, reply) => {
    const { relativePath: rawPath, title, description, isPublic, accessPassword, shareId } = request.body as any;
    const relativePath = normalizeRelativePath(rawPath);

    try {
      const absoluteTarget = getSecureFilePath(relativePath);

      if (!fs.existsSync(absoluteTarget)) {
         return reply.code(404).send({ error: 'Target physical file does not exist' });
      }

      await FileMetaModel.upsert({
        relative_path: relativePath,
        title,
        description,
        is_public: !!isPublic,
        access_password: accessPassword,
        share_id: shareId
      });

      return { success: true };
    } catch (e: any) {
      reply.code(400).send({ error: e.message });
    }
  });

  // 5. 获取所有已分享文件清单
  fastify.get('/shared', async () => {
    const sharedFiles = await FileMetaModel.findAllShared();
    return { files: sharedFiles };
  });

  // 6. 获取系统运行状态
  fastify.get('/system-stats', async () => {
    const stats = {
      rootPath: path.resolve(config.filesRoot),
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
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
