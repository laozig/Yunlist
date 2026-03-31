# Yunlist

一个轻量、现代化的个人网盘系统，支持文件管理、公开分享、访问统计、回收站、访问审计，以及基于 Docker + Caddy 的生产部署。

## 功能特性

### 文件管理
- 文件 / 文件夹浏览
- 上传文件（支持多选与拖拽上传）
- 新建文件夹
- 重命名 / 移动 / 复制
- 批量删除 / 批量分享 / 批量取消分享
- 文件夹打包下载

### 分享能力
- 单文件 / 文件夹公开分享
- 自定义分享后缀
- 访问密码保护
- 分享过期时间
- 最大访问次数 / 最大下载次数限制
- 分享二维码

### 数据与运维
- SQLite 元数据存储
- 分享访问统计
- 热门文件排行
- 访问审计日志（IP / User-Agent / 事件范围）
- 回收站（恢复 / 彻底删除 / 批量操作）

## 技术栈

### 后端
- Node.js
- TypeScript
- Fastify
- SQLite

### 前端
- React
- Vite
- TypeScript
- Tailwind CSS
- Recharts
- Framer Motion

### 部署
- Docker
- Docker Compose
- Caddy（反向代理 + 自动 HTTPS）

## 项目结构

```text
.
├─ src/                  # 后端源码
├─ frontend/             # 前端源码
├─ storage/              # 本地开发时的文件目录
├─ Dockerfile            # 生产镜像构建
├─ docker-compose.yml    # 应用 + Caddy 编排
├─ Caddyfile             # HTTPS 反向代理配置
├─ deploy.md             # 生产部署说明
└─ .env.example          # 环境变量示例
```

## 本地开发

### 1. 安装后端依赖

```bash
npm install
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 3. 创建环境变量

Windows PowerShell：

```powershell
copy .env.example .env
```

Linux / macOS：

```bash
cp .env.example .env
```

然后编辑 `.env`，至少填写：

```env
ADMIN_PASSWORD=changeme
JWT_SECRET=your-very-secret-key
FILES_ROOT=storage
DB_PATH=db.sqlite
PORT=3000
```

### 4. 启动后端

```bash
npm run dev
```

### 5. 启动前端

```bash
cd frontend
npm run dev
```

开发环境默认：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 常用脚本

### 后端

```bash
npm run dev
npm run build
npm run start
```

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

## 生产部署

项目已经内置生产部署文件：

- `Dockerfile`
- `docker-compose.yml`
- `Caddyfile`
- `deploy.md`

推荐直接阅读：

```text
deploy.md
```

### 快速启动

```bash
cp .env.example .env
# 修改 .env
# 修改 Caddyfile 中的域名和邮箱
docker compose up -d --build
```

部署完成后由 Caddy 自动提供 HTTPS。

## 数据持久化说明

生产环境中建议挂载：

- `./data/files`：真实文件
- `./data/db`：SQLite 数据库
- `./caddy_data`：证书数据
- `./caddy_config`：Caddy 配置缓存

这样即使容器重建，以下数据也不会丢失：
- 文件本体
- 文件介绍 / 标题 / 分享设置
- 分享记录
- 访问统计与审计日志

## 适用场景

- 个人文件分享站
- 家庭 NAS 轻量前端
- 小团队内部临时文件分发
- 自建网盘 / 下载站

## 说明

- 本项目使用 SQLite，适合轻量场景与单实例部署。
- 分享二维码目前通过在线服务生成，便于快速使用。
- 若需要更复杂的多用户权限、对象存储、分片上传等能力，可在现有基础上继续扩展。
