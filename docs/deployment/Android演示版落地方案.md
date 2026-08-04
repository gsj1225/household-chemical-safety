# Android 演示版落地方案

> 版本：v2.0（安全返工后）
>
> 日期：2026-08-04
>
> 阶段定位：**单家庭、比赛演示版**，非正式多用户产品。

---

## 一、当前架构审计

### 1.1 移动端

| 审计项 | 现状 | 阻塞/风险 |
|--------|------|-----------|
| `android.package` | `com.homechem.safety` | 已修复 |
| `versionCode` | `2` | 已修复 |
| `eas.json` | `preview` 和 `production` profile，不保存真实 URL 和令牌 | 已修复 |
| `EXPO_PUBLIC_API_BASE_URL` | 默认 `127.0.0.1`，通过 EAS Dashboard 环境变量注入 | 部署时填入 |
| `lanLocal` profile | **已删除**（不实现明文网络配置） | 不适用 |
| EAS 环境变量校验 | `eas-build-pre-install` 钩子校验 HTTPS 地址和令牌非空 | 已就绪 |
| 相机/相册/文件存储 | 标准 Expo 插件，独立 APK 可用 | 无风险 |
| 产品照片保存位置 | **设备本地**，不上传后端 | 仅保存在手机 |
| Expo Go 专属逻辑 | 无残留 | 无风险 |
| Expo SDK | 57.0.7 | iOS Expo Go 不兼容（发布前阻塞项） |

### 1.2 后端

| 审计项 | 现状 | 阻塞/风险 |
|--------|------|-----------|
| 启动命令 | `uvicorn app.main:app --host 0.0.0.0 --port 8000` | 可用 |
| SQLite 数据库路径 | `data/inventory.db` | 已修复 |
| 服务重启后数据 | SQLite 文件在磁盘上则保留；容器需挂载 volume | 部署时配置持久卷 |
| Qwen API Key 读取 | 环境变量 `QWEN_API_KEY`，`.env` 在 `.gitignore` 中 | 安全 |
| Mock/真实 Qwen 切换 | `AI_PROVIDER=mock`（默认）或 `qwen`，环境变量切换 | 可用 |
| CORS | DEBUG=false 禁止 `*`；原生 APK 用 `[]`，Web QA 用明确 Origin | 已修复 |
| 演示令牌 | `DEMO_ACCESS_TOKEN` 环境变量，设置后 /api 需 Bearer 认证 | 已修复 |
| 识别限流 | `RECOGNITION_RATE_LIMIT_PER_MINUTE` 独立限流 | 已修复 |
| 健康检查 | DB 不可用时返回 503 | 已修复 |
| Dockerfile | 含 `VOLUME /app/data` | 已修复 |
| 旧 challenge 路由 | `challenge.py` 存在但未注册 | 无影响 |

### 1.3 数据与安全

| 审计项 | 现状 | 风险等级 |
|--------|------|---------|
| 库存共享 | **所有请求共享同一 SQLite 库存**，无用户隔离 | **中** — 定位为"单家庭演示版" |
| 演示令牌 | 所有 /api 路由需 Bearer token，支持随时轮换 | 已缓解 |
| 日志记录内容 | 记录 method/path/status/duration，不记录图片和密钥 | 安全 |
| 图片数据 | 仅内存使用，不写磁盘 | 安全 |
| API Key 泄漏 | `.env` 在 `.gitignore`，Git 历史无泄漏 | 安全 |
| GitHub 历史 | 无 `sk-` 格式密钥 | 安全 |

---

## 二、本阶段范围

### 2.1 定位

**单家庭、比赛演示版**。一个受控演示库存，SQLite + 持久化磁盘，Android APK 直接安装，真实 Qwen 或 Mock 回退，临时公网后端。

### 2.2 允许

- 一个受控演示库存（所有设备共享同一库存，视为"一个家庭"）
- SQLite + 持久化磁盘
- Android APK 直接安装
- 真实 Qwen 识别或 Mock 回退
- 临时公网后端（有效域名 + 受信任 HTTPS）
- 演示访问令牌（支持轮换）

### 2.3 不包含

- App Store / Google Play 发布
- 多用户注册登录
- 支付
- 正式隐私合规
- iOS 正式构建
- 大规模并发
- 自签证书（不支持）

### 2.4 共享库存风险声明

> **当前后端无用户隔离，公网部署后所有连接的设备将看到同一库存。** 这在"单家庭演示版"定位下是可接受的，但不得默认为正式可用。

---

## 三、目标架构

### 3.1 调用链

```
Android APK（离线可启动）
  → HTTPS API（有效域名 + Let's Encrypt 证书）
    → FastAPI（uvicorn）
      → DemoAuth 中间件（Bearer token 校验）
      → InventoryService / RecognitionService / CompatibilityService
        → SQLite（持久化磁盘卷）
        → Qwen API（公网调用，失败时可切换 Mock）
```

### 3.2 数据流向

| 数据 | 存储位置 | 说明 |
|------|---------|------|
| 产品结构化信息 | 服务端 SQLite | 所有设备共享 |
| 相容性关系 | 服务端 SQLite | 规则引擎计算后写入 |
| 产品封面照片 | **手机本地** | 不上传后端，不跨设备同步 |
| 识别上传照片 | **内存临时** | 识别完成后丢弃 |
| 演示令牌 | APK 编译时注入 + 后端环境变量 | 不存 Qwen Key |

### 3.3 AI 不可用时回退

```
AI_PROVIDER=qwen → Qwen API 失败 → 前端提示重试
手动切换 AI_PROVIDER=mock → 预设产品库 → 演示流程不中断
```

### 3.4 后端离线时应用行为

- 前端显示"无法连接服务"错误页面
- 库存列表保留上次缓存

### 3.5 比赛现场快速恢复

| 故障 | 恢复方式 | 预计时间 |
|------|---------|---------|
| 后端崩溃 | 重启容器 | < 30s |
| SQLite 损坏 | 恢复最近备份 | < 2min |
| Qwen 不可用 | 切换 `AI_PROVIDER=mock` 重启 | < 1min |
| APK 崩溃 | 重新安装 APK | < 2min |
| 网络中断 | 无法恢复（不支持局域网备用） | — |

---

## 四、部署方案比较

### 4.1 方案对比

| 维度 | A. 国内云 VPS | B. 持久化托管平台 | C. 比赛现场局域网 |
|------|-------------|-----------------|-----------------|
| **国内手机访问** | 稳定，延迟低 | 取决于平台区域 | 局域网内极低延迟 |
| **HTTPS** | 有效域名 + Let's Encrypt | 平台自动提供 | **不支持**（自签证书不可用） |
| **SQLite 持久化** | 挂载磁盘卷 | 需选支持持久磁盘的平台 | 本机磁盘 |
| **休眠/冷启动** | 不休眠 | 免费层可能休眠 | 不休眠 |
| **成本** | 约 30-60 元/月 | 免费层可用 | 0 元 |
| **部署复杂度** | 中（Docker + Nginx） | 低 | 低 |
| **备案/域名** | 需有效域名 | 平台提供子域名 | 不适用 |

### 4.2 推荐方案：A. 国内云 VPS

**理由**：HTTPS 可控（Let's Encrypt 免费证书），不休眠，SQLite 持久化完全可控。

### 4.3 现场备用方案

**不支持局域网备用**。自签证书无法被 APK 信任，明文 HTTP 被 Android 9+ 默认禁止。如 VPS 不可用，只能等待恢复。

---

## 五、Android 构建方案

### 5.1 APK 配置

| 配置项 | 值 |
|--------|-----|
| `applicationId` | `com.homechem.safety` |
| 应用名称 | 家庭化学品安全检查 |
| `version` | `1.0.1` |
| `versionCode` | `2` |
| 构建方式 | EAS Build（preview profile, APK, internal） |

### 5.2 环境变量

| 变量 | 用途 | 放置位置 | 安全级别 |
|------|------|---------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | 编译时注入后端 API 地址 | `eas.json` env | 公开 |
| `EXPO_PUBLIC_DEMO_ACCESS_TOKEN` | 编译时注入演示令牌到 APK | `eas.json` env | **短期演示用**（见下方说明） |
| `AI_PROVIDER` | 运行时后端 AI 切换 | 后端环境变量 | 内部 |
| `QWEN_API_KEY` | 运行时后端调用 Qwen | 后端环境变量 | **秘密，绝不放入 APK** |
| `DEMO_ACCESS_TOKEN` | 运行时后端鉴权 | 后端环境变量 | 内部 |

#### 演示令牌安全说明

`EXPO_PUBLIC_DEMO_ACCESS_TOKEN` 编译时嵌入 APK，可被逆向工程提取。
它**不是正式安全秘密**，仅用于比赛演示期间的访问控制。

- **比赛版**：短期令牌可嵌入 APK，比赛后立即轮换后端 `DEMO_ACCESS_TOKEN`
- **正式产品**：必须改用用户认证（OAuth/OIDC）替代静态令牌
- `QWEN_API_KEY` 等真正密钥**绝不**放入 `EXPO_PUBLIC_*` 变量或 APK

### 5.3 EAS 环境变量配置

构建前在 EAS Dashboard 中设置以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `EXPO_PUBLIC_API_BASE_URL` | `https://你的域名/api` | 后端 API 公网地址，必须 HTTPS |
| `EXPO_PUBLIC_DEMO_ACCESS_TOKEN` | `<与后端一致的令牌>` | 演示访问令牌 |

`eas.json` 不保存真实 URL 和令牌，通过 EAS 环境变量注入。
构建时自动执行 `eas-build-pre-install` 钩子校验环境变量。

### 5.4 签名密钥管理

- EAS Build 自动管理签名密钥
- 演示版使用 EAS 内部分发签名

### 5.5 APK 下载/分发

- EAS Build 完成后生成下载链接
- 生成二维码贴在 `docs/deployment/` 中
- 比赛现场扫码安装

---

## 六、差距清单（返工后状态）

| 编号 | 差距 | 状态 |
|------|------|------|
| G1 | `app.json` 缺少 `android.package` | 已修复 |
| G2 | `app.json` 缺少 `android.versionCode` | 已修复 |
| G3 | `EXPO_PUBLIC_API_BASE_URL` 默认 `127.0.0.1` | 部署时注入 |
| G4 | `APP_NAME` 仍为"排雷挑战" | 已修复 |
| G5 | `DATABASE_PATH` 仍为 `challenges.db` | 已修复 |
| G6 | Dockerfile 注释仍为"排雷挑战" | 已修复 |
| G7 | `.env.example` 注释仍为"排雷挑战" | 已修复 |
| G8 | CORS 生产配置 | 已修复（禁止 *，支持 [] 和明确 Origin） |
| G9 | 健康检查无 DB 验证 | 已修复（503 on failure） |
| G10 | 无数据备份脚本 | 已修复（在线备份 + 完整性校验） |
| G12 | `eas.json` 缺少环境变量注入 | 已修复 |
| G13 | 无演示访问令牌 | 已修复（DEMO_ACCESS_TOKEN） |
| G14 | 识别无限流 | 已修复（RECOGNITION_RATE_LIMIT_PER_MINUTE） |
| G15 | 自签证书方案 | 已删除 |
| G16 | Nginx/Certbot 签发顺序 | 已修复（两阶段） |
| G17 | README 路径错误 | 已修复 |
| G18 | lanLocal profile | 已删除 |
| G19 | EAS 占位符检测 | 已修复（eas-pre-build-check.sh） |

---

## 七、环境变量清单

### 7.1 后端环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `AI_PROVIDER` | 否 | `mock` | `mock` 或 `qwen` |
| `QWEN_API_KEY` | qwen 时必填 | `""` | Qwen API 密钥 |
| `DEBUG` | 否 | `true` | 生产环境设为 `false` |
| `DATABASE_PATH` | 否 | `data/inventory.db` | SQLite 路径 |
| `CORS_ORIGINS` | 否 | `["*"]` | DEBUG=false 禁止 `*`；APK 用 `[]` |
| `DEMO_ACCESS_TOKEN` | DEBUG=false 时必填 | `""` | 演示令牌，空则不鉴权；生产环境必须非空 |
| `RECOGNITION_RATE_LIMIT_PER_MINUTE` | 否 | `10` | 识别接口限流 |

### 7.2 移动端环境变量（编译时）

| 变量 | 必填 | 说明 |
|------|------|------|
| `EXPO_PUBLIC_API_BASE_URL` | 是 | 后端 API 地址（必须 https://） |
| `EXPO_PUBLIC_DEMO_ACCESS_TOKEN` | 是 | 演示令牌（短期可嵌入，见 5.2 安全说明） |

### 7.3 禁止放入 APK 的变量

- `QWEN_API_KEY` — 真正密钥，绝不放入 APK
- 任何含 `SECRET`、`PASSWORD` 的变量

> 注意：`EXPO_PUBLIC_DEMO_ACCESS_TOKEN` 是**短期演示令牌**，可嵌入 APK 但不属于安全秘密。比赛后必须轮换。正式产品必须改用用户认证。

---

## 八、备份与恢复

### 8.1 备份

- 使用 SQLite Online Backup API（`.backup` 命令），不阻塞并发读写
- 备份后执行 `PRAGMA integrity_check` 校验
- 原子重命名（先写 .tmp 再 mv）
- 路径：`data/backups/inventory-backup-YYYYMMDD-HHMMSS.db`
- 与 docker compose volume 挂载一致

### 8.2 恢复

1. 停止后端服务
2. 校验备份完整性
3. 备份当前数据库为安全副本
4. 原子替换（cp → mv）
5. 重启后端

---

## 九、风险与非目标

### 9.1 已知风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 公网部署后所有设备共享库存 | 中 | 定位为"单家庭演示版" |
| Qwen API 配额耗尽 | 中 | Mock 回退 |
| VPS 网络中断 | 低 | 无局域网备用（自签证书不可用） |
| 演示令牌泄漏 | 低 | 支持随时轮换（修改环境变量重启） |

### 9.2 非目标

- 多用户注册登录
- 跨设备封面照片同步
- Google Play / App Store 发布
- 正式隐私合规
- iOS 正式构建
- 自签证书 / 局域网备用 APK
- 大规模并发优化

---

## 十、预计实施顺序

| 步骤 | 预计工时 | 依赖 | 用户确认项 |
|------|---------|------|-----------|
| S1 后端配置修复 | 已完成 | 无 | — |
| S2 部署配置编写 | 已完成 | S1 | — |
| S3 后端部署上线 | 1h | S2 + VPS + 域名 | **需用户提供 VPS 和域名** |
| S4 移动端配置修复 | 已完成 | 无 | — |
| S5 APK 构建 | 1h | S3 + S4 + EAS 账号 | **需用户确认 EAS 账号可用** |
| S6 冒烟验证 | 0.5h | S3 + S5 | — |
| S7 比赛现场准备 | 0.5h | S6 | — |
