import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from '../config';

// 声明一个全局 DB 实例
let dbInstance: Database | null = null;

// 初始化 SQLite 数据库连接 (使用异步 sqlite/sqlite3 以兼容所有系统)
export const initDB = async (): Promise<Database> => {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: config.dbPath,
    driver: sqlite3.Database
  });

  // 开启 WAL 模式以提升并发性能
  await dbInstance.exec('PRAGMA journal_mode = WAL');

    // Create metadata table for files
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS files_meta (
        relative_path TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        is_public INTEGER DEFAULT 0,
        access_password TEXT,
        share_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SQLite 不直接支持 "IF NOT EXISTS" 列，检查并补全 share_id 字段
    try {
      await dbInstance.exec('ALTER TABLE files_meta ADD COLUMN share_id TEXT');
    } catch (e) {
      // 字段已存在或其它错误，忽略
    }

    try {
      await dbInstance.exec('ALTER TABLE files_meta ADD COLUMN expires_at DATETIME');
    } catch (e) {
      // 字段已存在或其它错误，忽略
    }

    try {
      await dbInstance.exec('ALTER TABLE files_meta ADD COLUMN max_views INTEGER');
    } catch (e) {
      // 字段已存在或其它错误，忽略
    }

    try {
      await dbInstance.exec('ALTER TABLE files_meta ADD COLUMN max_downloads INTEGER');
    } catch (e) {
      // 字段已存在或其它错误，忽略
    }

    // 创建唯一索引以保证 share_id 不重复且查询效率
    try {
      await dbInstance.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_meta_share_id ON files_meta(share_id)');
    } catch (e) {
      // 索引已存在，忽略
    }

    // 创建数据统计表：记录查看与下载行为
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS file_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        relative_path TEXT,
        event_type TEXT, -- 'view' | 'download'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_file_events_path_type ON file_events(relative_path, event_type)');

    // Create system config table
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Migration: Normalize existing relative_path (remove leading slashes for consistency)
    try {
      await dbInstance.exec(`
        UPDATE files_meta SET relative_path = ltrim(relative_path, '/') WHERE relative_path LIKE '/%';
        UPDATE file_events SET relative_path = ltrim(relative_path, '/') WHERE relative_path LIKE '/%';
      `);
    } catch (e) {
      console.warn('Database path normalization migration failed (might be expected):', e);
    }
  return dbInstance;
};

// 获取 db 实例对象
export const getDB = () => {
  if (!dbInstance) throw new Error('DB is not initialized yet');
  return dbInstance;
};
