#!/usr/bin/env bash
#
# factory-mgmt 部署脚本（在目标 VPS 上运行）
# 适用：阿里云 / 腾讯云 轻量服务器 + 宝塔 Linux 面板
# 前置：代码已上传到 $APP_DIR（见下方「本地传输」说明）
#
# 用法：
#   chmod +x deploy_vps.sh
#   ./deploy_vps.sh
#
set -e

APP_DIR=/www/wwwroot/factory-mgmt
DATA_DIR=/www/server/factory-data
PORT=3000
NODE_VER=20

echo "=============================================="
echo "  factory-mgmt 部署脚本"
echo "  APP_DIR  = $APP_DIR"
echo "  DATA_DIR = $DATA_DIR"
echo "  PORT     = $PORT"
echo "=============================================="

# ---------- 0. 环境检测 ----------
if command -v dnf &>/dev/null; then
  PKG_MGR=dnf
  echo "[环境] 检测到 dnf（AlibabaLinux/Anolis/RHEL8+）"
elif command -v yum &>/dev/null; then
  PKG_MGR=yum
  echo "[环境] 检测到 yum"
elif [ -f /etc/redhat-release ]; then
  PKG_MGR=yum
  echo "[环境] 检测到 RHEL/CentOS，使用 yum"
else
  PKG_MGR=apt
  echo "[环境] 检测到 Debian/Ubuntu，使用 apt"
fi

# ---------- 1. 安装编译依赖（better-sqlite3 需要）----------
echo "== 1/7 安装系统依赖（python3 / make / g++）=="
if [ "$PKG_MGR" = "apt" ]; then
  apt-get update -y
  apt-get install -y python3 make g++ git
else
  # dnf 或 yum（AlibabaLinux / CentOS / RHEL / Anolis 等）
  "$PKG_MGR" install -y python3 make gcc-c++ git
fi

# ---------- 2. 安装 Node.js $NODE_VER ----------
echo "== 2/7 安装 Node.js $NODE_VER =="
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  if [ "$PKG_MGR" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    "$PKG_MGR" install -y nodejs
  fi
else
  echo "Node 已安装: $(node -v)，跳过"
fi
node -v
npm -v

# ---------- 3. 准备目录 ----------
echo "== 3/7 创建应用与数据目录 =="
mkdir -p "$APP_DIR" "$DATA_DIR"

# ---------- 4. 安装 PM2（进程守护，开机自启）----------
echo "== 4/7 安装 PM2 =="
npm install -g pm2

# ---------- 5. 安装后端依赖（会编译 better-sqlite3）----------
echo "== 5/7 安装后端依赖 =="
cd "$APP_DIR/server"
npm install --production=false
echo "better-sqlite3 编译完成"

# ---------- 6. 构建前端 ----------
echo "== 6/7 构建前端（限制内存，避免 1G 机器 OOM）=="
cd "$APP_DIR/client"
export NODE_OPTIONS=--max-old-space-size=512
npm install
npm run build
echo "前端构建完成 -> $APP_DIR/client/dist"

# ---------- 7. 写环境变量 + 启动 ----------
echo "== 7/7 写 .env 并用 PM2 启动 =="
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$PORT
DATA_DIR=$DATA_DIR
EOF

cd "$APP_DIR"
# 若已存在同名进程则删掉重启
pm2 delete factory-mgmt 2>/dev/null || true
pm2 start "$APP_DIR/server/src/index.js" --name factory-mgmt --env production
pm2 save
pm2 startup || true

echo ""
echo "=============================================="
echo " 部署完成！"
echo " 本地访问:  http://127.0.0.1:$PORT"
echo " 进程状态:  pm2 status"
echo " 查看日志:  pm2 logs factory-mgmt"
echo "=============================================="
echo ""
echo "下一步（在宝塔面板里做）："
echo "  1. 网站 -> 添加站点 -> 域名填服务器公网IP（如 1.2.3.4）"
echo "  2. 该站点 -> 反向代理 -> 目标URL填 http://127.0.0.1:$PORT"
echo "  3. 该站点 -> SSL -> 申请 Let's Encrypt 免费证书（需域名；纯IP可跳过）"
echo "  4. 安全组/防火墙放行 80/443 端口"
echo ""
echo "数据迁移（部署完成后，在本机执行）："
echo "  python restore_to_vps.py  http://<服务器IP>:3000"
