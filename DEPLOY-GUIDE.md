# 工厂管理系统 - Render 部署指南

## 第一阶段：上传代码到 GitHub

### 1. 注册 GitHub 账号（已有可跳过）
- 打开 https://github.com/signup
- 填邮箱、密码、用户名，完成注册

### 2. 在 GitHub 创建新仓库
- 登录后点击右上角 **+** → **New repository**
- Repository name 填 `factory-mgmt`
- 选择 **Private**（私有，更安全）
- **不要**勾选 Add README / .gitignore / license（我们已有）
- 点击 **Create repository**

### 3. 创建 Personal Access Token（推送代码需要）
- 点击右上角头像 → **Settings** → 左侧最底部 **Developer settings**
- **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
- Note 填 `factory-deploy`
- Expiration 选 90 days
- 勾选 **repo**（整个 repo 权限）
- 点 **Generate token** → **立刻复制** token（只显示一次！）

### 4. 推送代码到 GitHub
在电脑上打开终端（或用 WorkBuddy 的终端），执行：

```bash
cd C:/Users/Administrator/WorkBuddy/2026-08-04-11-07-47/factory-mgmt

# 把 YOUR_USERNAME 换成你的 GitHub 用户名
git remote add origin https://github.com/YOUR_USERNAME/factory-mgmt.git

# 推送（会提示输入用户名和密码）
# 用户名：你的 GitHub 用户名
# 密码：粘贴刚才复制的 Token（不是 GitHub 登录密码！）
git push -u origin master
```

推送成功后，在 GitHub 上就能看到你的代码了。

---

## 第二阶段：在 Render 部署

### 1. 注册 Render 账号
- 打开 https://render.com/register
- 点击 **Sign up with GitHub**（用 GitHub 账号直接注册，最方便）

### 2. 创建 Web Service
- 登录后点击右上角 **New +** → **Web Service**
- 选择 **Build and deploy from a Git repository**
- 连接你的 GitHub 账号，选择 `factory-mgmt` 仓库
- Render 会自动检测到 `render.yaml` 配置文件

### 3. 确认配置（render.yaml 已自动填充）
以下配置应该已自动填好，确认一下：

| 配置项 | 值 |
|--------|-----|
| Name | factory-mgmt |
| Runtime | Node |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Plan | Starter（$7/月，含持久磁盘） |

环境变量：
- `NODE_ENV` = `production`
- `DATA_DIR` = `/opt/data`（SQLite 数据库存放路径，持久磁盘）

### 4. 点击 Create Web Service
- Render 开始自动构建（约 3-5 分钟）
- 构建过程：安装前端依赖 → 构建前端 → 安装后端依赖 → 编译 better-sqlite3
- 构建完成后自动启动服务

### 5. 获取访问地址
- 部署成功后，Render 会给你一个地址，类似：
  `https://factory-mgmt.onrender.com`
- 这就是你的系统访问地址！
- 用手机、电脑、任何设备打开这个地址都能用
- 自带 HTTPS，手机摄像头扫码功能正常

---

## 部署后说明

### 登录账号（和本地一样）
| 角色 | 用户名 | 密码 |
|------|--------|------|
| 主管理者 | admin | admin123 |
| 生产线 | production | prod123 |
| 客服 | service | service123 |
| 发货 | shipping | ship123 |

### 重要提示
- **Starter 计划 $7/月**：包含 1GB 持久磁盘，数据不会丢失
- 如果用 Free 计划测试：没有持久磁盘，每次重新部署数据会重置
- 代码有更新时，只需 `git push` 到 GitHub，Render 会自动重新部署
- 建议部署成功后立刻修改默认密码

### 本地开发不受影响
本地继续用 `start.bat` 启动，局域网访问 `https://192.168.124.3:3443`，
云端用 Render 地址访问，两套数据独立互不影响。
