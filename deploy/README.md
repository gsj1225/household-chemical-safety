# 家庭化学品库 — 部署操作手册

> 本文档面向部署操作者，涵盖从零部署到比赛现场恢复的完整流程。

---

## 前置条件

| 项目 | 要求 |
|------|------|
| VPS | Ubuntu 22.04+，1核2G 足够 |
| Docker | 20.10+ |
| Docker Compose | v2+ |
| Python | 3.10+（Ubuntu 22.04 自带 `python3`） |
| Nginx | 已安装 |
| 域名 | **必须**。不支持 IP + 自签证书方案（APK 信任系统 CA，自签证书无法使用） |

---

## 1. 部署步骤

### 1.1 克隆代码

```bash
git clone <repo-url> /opt/homechem
cd /opt/homechem
```

### 1.2 配置后端环境变量

```bash
cp deploy/.env.example backend/.env
vi backend/.env
```

关键配置：

```ini
AI_PROVIDER=qwen
QWEN_API_KEY=<真实密钥>
DEBUG=false
DATABASE_PATH=data/inventory.db
CORS_ORIGINS=[]
DEMO_ACCESS_TOKEN=<生成的随机令牌>
```

> 生成令牌：`python3 -c "import secrets; print(secrets.token_urlsafe(24))"`

### 1.3 创建数据目录

```bash
mkdir -p /opt/homechem/data
```

### 1.4 启动后端

```bash
cd /opt/homechem/deploy
docker compose up -d
```

验证：

```bash
curl http://localhost:8000/health
# 期望: {"status":"ok","app":"家庭化学品库","db":"ok"}
```

### 1.5 配置 Nginx + HTTPS（分两阶段）

**阶段1：HTTP-only（首次申请证书前）**

```bash
# 创建 certbot 验证目录
mkdir -p /var/www/certbot

# 编辑 nginx.conf，注释阶段2块，取消注释阶段1块
# 替换 PLACEHOLDER_DOMAIN 为你的域名
cp deploy/nginx.conf /etc/nginx/sites-available/homechem
sed -i 's/PLACEHOLDER_DOMAIN/你的域名/g' /etc/nginx/sites-available/homechem
ln -sf /etc/nginx/sites-available/homechem /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 申请 Let's Encrypt 证书
sudo certbot certonly --webroot -w /var/www/certbot -d 你的域名
```

**阶段2：切换到 HTTPS（证书签发成功后）**

```bash
# 编辑 nginx.conf，注释阶段1块，取消注释阶段2块
vi /etc/nginx/sites-available/homechem
nginx -t && systemctl reload nginx

# 设置自动续期
sudo certbot renew --dry-run
```

### 1.6 验证公网访问

```bash
curl https://你的域名/health
# 期望: {"status":"ok","app":"家庭化学品库","db":"ok"}
```

### 1.7 更新 CORS（如需 Web QA）

```ini
# backend/.env
CORS_ORIGINS=["https://你的域名"]
```

重启后端：

```bash
cd /opt/homechem/deploy
docker compose restart api
```

---

## 2. APK 构建

### 2.1 前置条件

- Expo EAS 账号
- 后端已部署且公网可访问

### 2.2 配置 EAS 环境变量

构建前，在 EAS Dashboard 中为项目配置以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `EXPO_PUBLIC_API_BASE_URL` | `https://你的域名/api` | 后端 API 公网地址，必须 HTTPS |
| `EXPO_PUBLIC_DEMO_ACCESS_TOKEN` | `<与 backend/.env 相同的令牌>` | 演示访问令牌，用于 APK 鉴权 |

> 比赛演示版访问令牌可嵌入 APK 中；比赛结束后立即轮换。
> 令牌通过 EAS 环境变量注入，不会写入 `eas.json` 或受 Git 跟踪的文件。

### 2.3 构建 APK

```bash
cd mobile
npx eas build --profile preview --platform android
```

### 2.4 获取下载链接

```bash
npx eas build:list --status finished
```

构建时会自动执行 `eas-build-pre-install` 钩子，校验：
- `EXPO_PUBLIC_API_BASE_URL` 已设置且为 HTTPS
- `EXPO_PUBLIC_DEMO_ACCESS_TOKEN` 已设置且非空

---

## 3. 数据备份与恢复

### 3.1 手动备份（SQLite 在线备份）

```bash
cd /opt/homechem
python3 backend/scripts/backup.py
# 备份到 data/backups/inventory-backup-YYYYMMDD-HHMMSS.db
```

### 3.2 定时备份

```bash
# crontab -e
# 每小时备份，保留最近 24 份
0 * * * * cd /opt/homechem && python3 backend/scripts/backup.py
```

### 3.3 恢复

```bash
# 1. 停止后端
cd /opt/homechem/deploy
docker compose stop api

# 2. 恢复（脚本会校验备份完整性 + 原子替换）
cd /opt/homechem
python3 backend/scripts/backup.py --restore data/backups/inventory-backup-YYYYMMDD-HHMMSS.db

# 3. 重启后端
cd /opt/homechem/deploy
docker compose start api
```

---

## 4. 回滚

```bash
cd /opt/homechem/deploy
docker compose down
git checkout <旧版本commit> -- ../backend
docker compose up -d
```

---

## 5. 冒烟检查清单

| 步骤 | 命令 | 预期 |
|------|------|------|
| 健康检查 | `curl https://域名/health` | 200, `{"status":"ok","app":"家庭化学品库","db":"ok"}` |
| 无令牌访问 | `curl https://域名/api/inventory/products` | 401 |
| 带令牌访问 | `curl -H "Authorization: Bearer <token>" https://域名/api/inventory/products` | 200, JSON 产品列表 |
| 相容性 | `curl -H "Authorization: Bearer <token>" https://域名/api/inventory/compatibility/summary` | 200, JSON 摘要 |
| 限流 | 连续 11 次识别请求 | 第 11 次返回 429 |
| APK 启动 | 打开 APK | 显示库存列表 |
| 拍照识别 | APK 中拍照 | 返回识别草稿 |
| 离线行为 | 关闭 WiFi 后打开 APK | 显示错误页 |