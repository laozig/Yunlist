import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { initDB } from './db';
import adminRoutes from './routes/admin';
import shareRoutes from './routes/share';

const fastify = Fastify({
  logger: true,
  // 部署在 Caddy / Nginx 等反向代理后时，信任转发头，确保 request.ip 能拿到真实访客 IP
  trustProxy: true,
});

// 注册 JWT 插件用于轻量级鉴权
fastify.register(fastifyJwt, {
  secret: config.jwtSecret
});

import { FileMetaModel } from './models/fileMeta';

// 极简鉴权登录路由：通过环境变量配置的全局管理员密码
fastify.post('/api/login', {
  schema: {
    body: {
      type: 'object',
      required: ['password'],
      properties: { password: { type: 'string', minLength: 1 } }
    }
  }
}, async (request, reply) => {
  const { password } = request.body as any;
  
  // 获取当前有效的密码
  const dbPassword = await FileMetaModel.getAdminPassword();
  const validPassword = dbPassword || config.adminPassword;

  if (password === validPassword) {
    const token = fastify.jwt.sign({ role: 'admin' });
    return { token };
  }
  
  reply.code(401).send({ error: '密码错误，请重新输入' });
});

// 挂载管理员核心接口 API
fastify.register(adminRoutes, { prefix: '/api/admin' });
// 挂载对外分享接口 API
fastify.register(shareRoutes, { prefix: '/api/share' });

const frontendDistPath = config.frontendDistPath;
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(frontendDistPath) && fs.existsSync(frontendIndexPath)) {
  const sendFrontendIndex = (_request: any, reply: any) => {
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(frontendIndexPath));
  };

  // 显式兜底根路径，避免 fastify-static 在根目录请求时返回 403
  fastify.get('/', sendFrontendIndex);

  fastify.register(fastifyStatic, {
    root: frontendDistPath,
    prefix: '/',
    index: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    const requestUrl = request.raw.url || '';
    const isApiRequest = requestUrl === '/api' || requestUrl.startsWith('/api/');

    if (request.method === 'GET' && !isApiRequest) {
      return sendFrontendIndex(request, reply);
    }

    return reply.code(404).send({ error: 'Not Found' });
  });
}

// 启动服务
const start = async () => {
  try {
    await initDB(); // 等待数据库初始化完成
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
