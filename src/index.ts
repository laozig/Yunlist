import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from './config';
import { initDB } from './db';
import adminRoutes from './routes/admin';
import shareRoutes from './routes/share';

const fastify = Fastify({ logger: true });

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
