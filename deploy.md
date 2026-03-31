# Yunlist 生产环境部署说明

本文档用于将 Yunlist 以 **Docker + Docker Compose + Caddy** 的方式部署到生产服务器，并启用 **HTTPS**。

---

## 1. 部署架构

本项目采用以下生产部署结构：

- **app 容器**：运行 Yunlist 后端，并直接挂载前端构建产物，统一对外提供 Web 页面和 API。
- **caddy 容器**：作为反向代理，负责：
  - 自动申请和续期 HTTPS 证书
  - 自动将 HTTP 重定向到 HTTPS
  - 转发请求到 `app:3000`

### 持久化目录

宿主机将使用以下目录：

- `./data/files`：保存用户真实文件
- `./data/db`：保存 SQLite 数据库
- `./caddy_data`：保存 Caddy 的证书数据
- `./caddy_config`：保存 Caddy 的运行配置缓存

---

## 2. 服务器前置要求

建议服务器环境：

- Linux 服务器（Ubuntu / Debian / CentOS / Rocky Linux 均可）
- 已安装 **Docker**
- 已安装 **Docker Compose 插件**（`docker compose`）
- 域名已经解析到服务器公网 IP
- 防火墙已放行端口：
  - `80/tcp`
  - `443/tcp`

### 检查 Docker

```bash
docker --version
docker compose version
```

---

## 3. 上传项目代码

把整个项目上传到服务器，例如放到：

```bash
/opt/yunlist
```

进入项目目录：

```bash
cd /opt/yunlist
```

---

## 4. 配置域名与邮箱

### 4.1 修改 `Caddyfile`

打开项目根目录下的 `Caddyfile`：

```caddy
{
    email your-email@example.com
}

your-domain.example.com {
    encode zstd gzip
    reverse_proxy app:3000
}
```

你需要修改两处：

1. 把邮箱改成你自己的：

```caddy
email admin@example.com
```

2. 把域名改成你的正式域名：

```caddy
pan.example.com {
    encode zstd gzip
    reverse_proxy app:3000
}
```

> 说明：Caddy 会自动申请 Let’s Encrypt 证书，并自动把 HTTP 重定向到 HTTPS。

---

## 5. 配置环境变量

先复制环境变量模板：

### Windows PowerShell

```powershell
copy .env.example .env
```

### Linux / macOS

```bash
cp .env.example .env
```

然后编辑 `.env`，至少修改以下内容：

```env
ADMIN_PASSWORD=请改成你的管理员密码
JWT_SECRET=请改成一串足够长的随机密钥
FILES_ROOT=/data/yunlist/files
DB_PATH=/data/yunlist/db/yunlist.db
FRONTEND_DIST_PATH=/app/frontend/dist
PORT=3000
```

### 建议

- `ADMIN_PASSWORD`：设置为复杂密码
- `JWT_SECRET`：建议使用 32 位以上随机字符串
- `FILES_ROOT` 与 `DB_PATH`：保持默认即可，已与 `docker-compose.yml` 挂载路径对应

---

## 6. 启动服务

在项目根目录执行：

```bash
docker compose up -d --build
```

首次启动会完成以下操作：

1. 构建后端镜像
2. 构建前端并打包到后端运行容器中
3. 启动 Yunlist 应用容器
4. 启动 Caddy 并申请 HTTPS 证书

---

## 7. 查看运行状态

### 查看容器状态

```bash
docker compose ps
```

### 查看应用日志

```bash
docker compose logs -f app
```

### 查看 Caddy 日志

```bash
docker compose logs -f caddy
```

---

## 8. 访问站点

如果域名解析正常、80/443 端口已开放，部署完成后可直接访问：

```text
https://你的域名
```

例如：

```text
https://pan.example.com
```

---

## 9. 数据持久化说明

### 文件数据

真实文件会保存在宿主机：

```text
./data/files
```

### SQLite 数据库

数据库会保存在宿主机：

```text
./data/db/yunlist.db
```

这意味着：

- 容器重启，数据不会丢失
- 镜像更新，数据不会丢失
- 分享记录、文件介绍、元数据都会保留

---

## 10. 更新项目

如果后续代码有更新，进入项目目录后执行：

```bash
git pull
docker compose up -d --build
```

---

## 11. 停止 / 重启

### 停止服务

```bash
docker compose down
```

### 重启服务

```bash
docker compose restart
```

> `docker compose down` 不会删除宿主机挂载的数据目录，因此文件和数据库仍然保留。

---

## 12. 备份建议

建议定期备份以下目录：

```text
./data/files
./data/db
./caddy_data
```

其中：

- `data/files`：真实文件
- `data/db`：数据库元数据
- `caddy_data`：HTTPS 证书数据

---

## 13. 常见问题排查

### 13.1 无法签发 HTTPS 证书

检查：

- 域名是否已解析到服务器公网 IP
- 80 端口和 443 端口是否开放
- `Caddyfile` 中域名是否填写正确

### 13.2 页面打不开或 502

检查：

```bash
docker compose logs -f app
docker compose logs -f caddy
```

### 13.2.1 Docker 构建时报 `npm ci` / lockfile 同步错误

如果你看到类似错误：

```text
npm ci can only install packages when your package.json and package-lock.json are in sync
```

说明服务器上的构建阶段使用了严格锁文件检查，而当前依赖树与 lockfile 不完全一致。当前仓库的部署版本已经把 Docker 构建改成更稳妥的：

```Dockerfile
npm install --no-audit --no-fund
```

因此你只需要先拉取最新代码，再重新构建：

```bash
git pull
docker compose up -d --build --force-recreate
```

如果你怀疑 Docker 缓存干扰，也可以执行：

```bash
docker compose build --no-cache
docker compose up -d
```

### 13.2.2 容器启动后提示 `GLIBC_2.38 not found`（sqlite3 加载失败）

如果你看到类似报错：

```text
Error: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
required by /app/node_modules/sqlite3/build/Release/node_sqlite3.node
```

说明 `sqlite3` 在安装依赖时拿到了一个与当前运行镜像 glibc 版本不兼容的预编译二进制文件。当前仓库最新部署版本已经把 Docker 构建改成：

- 在依赖安装阶段显式安装 `python3 / make / g++`
- 强制 `sqlite3` 在镜像内 **从源码编译**

你只需要拉取最新代码并重新构建镜像：

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

如果之前已有异常容器，可以先执行：

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 13.2.3 Caddy 提示 `lookup app ... no such host`

如果 Caddy 日志里出现：

```text
lookup app on 127.0.0.11:53: no such host
```

这通常不是 Caddy 本身的问题，而是 **`app` 容器没有正常启动 / 正在反复重启**，导致反向代理目标不可用。优先检查：

```bash
docker compose ps
docker compose logs -f app
```

只要 `app` 服务恢复正常，Caddy 就会自动恢复反向代理。

### 13.3 数据丢失

确认是否正确使用了挂载目录：

- `./data/files:/data/yunlist/files`
- `./data/db:/data/yunlist/db`

### 13.4 修改了域名后不生效

修改 `Caddyfile` 后执行：

```bash
docker compose restart caddy
```

如果需要完全重载，也可以：

```bash
docker compose up -d
```

---

## 14. 最简上线步骤（速查版）

```bash
cd /opt/yunlist
cp .env.example .env
# 修改 .env
# 修改 Caddyfile 中的邮箱和域名
docker compose up -d --build
```

上线完成后访问：

```text
https://你的域名
```
