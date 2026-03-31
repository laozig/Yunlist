#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="yunlist"

log() {
  printf '\n[deploy] %s\n' "$1"
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "需要 root 或 sudo 权限来安装缺失依赖：$*" >&2
    exit 1
  fi
}

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    echo "unknown"
  fi
}

install_system_packages() {
  local manager
  manager="$(detect_pkg_manager)"

  case "$manager" in
    apt)
      run_as_root apt-get update
      run_as_root apt-get install -y nodejs npm python3 python3-pip make g++
      ;;
    dnf)
      run_as_root dnf install -y nodejs npm python3 python3-pip make gcc-c++
      ;;
    yum)
      run_as_root yum install -y nodejs npm python3 python3-pip make gcc-c++
      ;;
    *)
      echo "未检测到支持的包管理器，请手动安装：node npm python3 pip3 make g++" >&2
      exit 1
      ;;
  esac
}

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

ensure_runtime_dependencies() {
  if ! ensure_command node || ! ensure_command npm || ! ensure_command python3 || ! ensure_command pip3 || ! ensure_command make || ! ensure_command g++; then
    log "检测到系统依赖缺失，尝试自动安装 node / npm / python3 / pip3 / make / g++"
    install_system_packages
  fi

  if ! ensure_command pm2; then
    log "未检测到 PM2，自动全局安装"
    run_as_root npm install -g pm2
  fi
}

install_caddy() {
  local manager
  manager="$(detect_pkg_manager)"

  case "$manager" in
    apt)
      if ! run_as_root apt-get install -y caddy; then
        log "APT 默认仓库未提供 Caddy，尝试接入官方稳定源"
        run_as_root apt-get update
        run_as_root apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
        run_as_root bash -c "curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
        run_as_root bash -c "curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list"
        run_as_root apt-get update
        run_as_root apt-get install -y caddy
      fi
      ;;
    dnf)
      run_as_root dnf install -y caddy || {
        echo "无法自动安装 Caddy，请先为当前系统配置 Caddy 软件源。" >&2
        exit 1
      }
      ;;
    yum)
      run_as_root yum install -y caddy || {
        echo "无法自动安装 Caddy，请先为当前系统配置 Caddy 软件源。" >&2
        exit 1
      }
      ;;
    *)
      echo "未检测到支持的包管理器，请手动安装 Caddy。" >&2
      exit 1
      ;;
  esac
}

load_env_file() {
  if [ -f "$ROOT_DIR/.env" ]; then
    log "加载 .env 环境变量"
    set -a
    # shellcheck disable=SC1091
    . "$ROOT_DIR/.env"
    set +a
  fi
}

prepare_environment() {
  cd "$ROOT_DIR"
  mkdir -p data/files data/db logs

  if [ ! -f .env ]; then
    log "未发现 .env，自动根据 .env.example 生成"
    cp .env.example .env
    echo "[deploy] 已生成 .env，请按需修改 ADMIN_PASSWORD / JWT_SECRET 等配置。"
  fi
}

configure_native_caddy() {
  if [ -z "${CADDY_DOMAIN:-}" ] || [ -z "${CADDY_EMAIL:-}" ]; then
    log "未检测到 CADDY_DOMAIN / CADDY_EMAIL，跳过 Caddy 自动安装与配置"
    log "如需原生 HTTPS，请先在 .env 中补充这两个变量，然后重新执行 ./deploy.sh"
    return
  fi

  if ! ensure_command caddy; then
    log "未检测到 Caddy，尝试自动安装"
    install_caddy
  fi

  local rendered_file
  rendered_file="$(mktemp)"
  sed \
    -e "s|your-email@example.com|${CADDY_EMAIL}|g" \
    -e "s|your-domain.example.com|${CADDY_DOMAIN}|g" \
    "$ROOT_DIR/Caddyfile.native" > "$rendered_file"

  run_as_root mkdir -p /etc/caddy
  run_as_root cp "$rendered_file" /etc/caddy/Caddyfile
  rm -f "$rendered_file"

  if command -v systemctl >/dev/null 2>&1; then
    run_as_root systemctl enable caddy >/dev/null 2>&1 || true
    if run_as_root systemctl is-active caddy >/dev/null 2>&1; then
      run_as_root systemctl reload caddy || run_as_root systemctl restart caddy
    else
      run_as_root systemctl restart caddy || run_as_root systemctl start caddy
    fi
    log "Caddy 已配置并尝试启动/重载"
  else
    log "未检测到 systemctl，请手动执行：caddy run --config /etc/caddy/Caddyfile"
  fi
}

install_project_dependencies() {
  cd "$ROOT_DIR"
  log "安装后端依赖"
  npm install --no-audit --no-fund

  log "安装前端依赖"
  cd "$ROOT_DIR/frontend"
  npm install --no-audit --no-fund
}

build_project() {
  cd "$ROOT_DIR"
  log "构建后端"
  npm run build

  log "构建前端"
  cd "$ROOT_DIR/frontend"
  npm run build

  if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    echo "前端构建失败：未发现 frontend/dist/index.html" >&2
    exit 1
  fi
}

start_or_reload_pm2() {
  cd "$ROOT_DIR"
  log "使用 PM2 启动/重载服务"

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
  else
    pm2 start ecosystem.config.js --env production
  fi

  pm2 save
}

print_summary() {
  cat <<'EOF'

[deploy] 部署完成。

常用命令：
  pm2 status
  pm2 logs yunlist
  pm2 restart yunlist

如需配合 Caddy 原生部署：
  1. 在 .env 中配置 CADDY_EMAIL / CADDY_DOMAIN
  2. 重新执行 ./deploy.sh，脚本会自动尝试安装并配置 Caddy
  3. 若你的系统没有 systemd，请手动执行：caddy run --config /etc/caddy/Caddyfile

EOF
}

main() {
  ensure_runtime_dependencies
  prepare_environment
  load_env_file
  install_project_dependencies
  build_project
  start_or_reload_pm2
  configure_native_caddy
  print_summary
}

main "$@"