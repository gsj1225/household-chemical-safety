# 家庭化学品库 — 部署操作手册

> 本文档面向部署操作者，涵盖从零部署到比赛现场恢复的完整流程。

---

## 前置条件

| 项目 | 要求 |
|------|------|
| VPS | Ubuntu 22.04+，1核2G 足够 |
| Docker | 20.10+ |
| Docker Compose | v2+ |
| Nginx | 已安装 |
| 域名（可选） | 如有域名可直接用 443 端口；无域名用 8443 非标端口 |

---

## 1. 部署步骤

### 1.1 克隆代码

```bash
git clone <repo-url> /opt/homechem
cd /opt/homechem
```

### 1.2 配置后端环境变量

```bash
cp deploy/.env.example ../backend/.env
# 或者直接创建
vi backend/.env
```

关键配置：

```ini
AI_PROVIDER=qwen
QWEN_API_KEY=<真实密钥>
DEBUG=false
DATABASE_PATH=data/inventory.db
CORS_ORIGINS=["*"]   # 演示用；有域名后改为明确域名
```

### 1.3 创建数据目录

```bash
mkdir -p /opt/homechem/data
```

### 1.4 启动后端

```bash
cd /opt/homechem/deploy
docker-compose up -d
```

验证：

```bash
curl http://localhost:8000/health
# 期望: {"status":"ok","app":"家庭化学品库","db":"ok"}
```

### 1.5 配置 Nginx + HTTPS

**有域名（推荐）：**

```bash
# 复制 Nginx 配置
cp deploy/nginx.conf /etc/nginx/sites-available/homechem

# 替换域名占位符
sed -i 's/PLACEHOLDER_DOMAIN/你的域名/g' /etc/nginx/sites-available/homechem

# 启用站点
ln -s /etc/nginx/sites-available/homechem /etc/nginx/sites-enabled/

# 申请 Let's Encrypt 证书
certbot --nginx -d 你的域名

# 重载 Nginx
nginx -t && systemctl reload nginx
```

**无域名（用 IP + 8443 端口免备案）：**

```bash
# 生成自签证书
mkdir -p /etc/nginx/ssl
openssl req -x509 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/homechem.key \
  -out /etc/nginx/ssl/homechem.crt \
  -days 30 -nodes \
  -subj "/CN=<VPS公网IP>"

# 启用 8443 配置（编辑 nginx.conf 取消注释 8443 server 块）
# 然后复制到 Nginx 并重载
nginx -t && systemctl reload nginx
```

### 1.6 验证公网访问

```bash
curl https://你的域名/health
# 或
curl -k https://VPS公网IP:8443/health
```

### 1.7 更新 CORS

公网验证通过后，收紧 CORS：

```ini
# backend/.env
CORS_ORIGINS=["https://你的域名"]
# 或无域名时设为 ["*"]（演示版可接受）
```

重启后端：

```bash
cd /opt/homechem/deploy
docker-compose restart api
```

---

## 2. APK 构建

### 2.1 前置条件

- Expo EAS 账号
- 修改 `mobile/eas.json` 中的 `PLACEHOLDER_REPLACE_BEFORE_BUILD` 为实际 API 地址

### 2.2 构建命令

```bash
cd mobile

# 登录 EAS
npx eas login

# 构建 APK（使用 preview profile）
npx eas build --profile preview --platform android

# 构建完成后获取下载链接
npx eas build:list --status finished
```

### 2.3 修改 API 地址

构建前必须更新 `eas.json` 中的 `EXPO_PUBLIC_API_BASE_URL`：

```json
{
  "preview": {
    "env": {
      "EXPO_PUBLIC_API_BASE_URL": "https://你的域名/api"
    }
  }
}
```

---

## 3. 数据备份与恢复

### 3.1 手动备份

```bash
sqlite3 /opt/homechem/data/inventory.db ".backup /opt/homechem/data/backup-$(date +%Y%m%d-%H%M%S).db"
```

### 3.2 定时备份

```bash
# crontab -e
# 每小时备份，保留最近 24 份
0 * * * * sqlite3 /opt/homechem/data/inventory.db ".backup /opt/homechem/data/backup-$(date +\%Y\%m\%d-\%H\%M).db" && find /opt/homechem/data/backup-*.db -mtime +1 -delete
```

### 3.3 恢复

```bash
cd /opt/homechem/deploy
docker-compose stop api

cp /opt/homechem/data/backup-YYYYMMDD-HHMM.db /opt/homechem/data/inventory.db

docker-compose start api
```

---

## 4. Mock 回退

Qwen 不可用时快速切换到 Mock：

```bash
# 编辑 .env
vi /opt/homechem/backend/.env
# 改为 AI_PROVIDER=mock

# 重启
cd /opt/homechem/deploy
docker-compose restart api

# 验证
curl http://localhost:8000/health
```

---

## 5. 回滚

```bash
# 回滚 Docker 镜像
cd /opt/homechem/deploy
docker-compose down
git checkout <旧版本commit> -- ../backend
docker-compose up -d

# 回滚数据
docker-compose stop api
cp /opt/homechem/data/backup-YYYYMMDD-HHMM.db /opt/homechem/data/inventory.db
docker-compose start api
```

---

## 6. 冒烟检查清单

| 步骤 | 命令 | 预期 |
|------|------|------|
| 健康检查 | `curl https://域名/health` | `{"status":"ok","app":"家庭化学品库","db":"ok"}` |
| 库存列表 | `curl https://域名/api/inventory/products` | JSON 产品列表 |
| 相容性 | `curl https://域名/api/compatibility/summary` | JSON 摘要 |
| APK 启动 | 打开 APK | 显示库存列表 |
| 拍照识别 | APK 中拍照 | 返回识别草稿 |
| 创建产品 | APK 中确认入库 | 库存列表新增 |
| 离线行为 | 关闭 WiFi 后打开 APK | 显示错误页 |
