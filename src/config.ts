import * as dotenv from 'dotenv';
import path from 'path';

// 始终从 process.cwd() (项目根目录) 加载 .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  adminPassword: requireEnv('ADMIN_PASSWORD'),
  jwtSecret: requireEnv('JWT_SECRET'),
  filesRoot: path.resolve(process.cwd(), process.env['FILES_ROOT'] ?? 'storage'),
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  dbPath: path.resolve(process.cwd(), process.env['DB_PATH'] ?? 'db.sqlite'),
};
