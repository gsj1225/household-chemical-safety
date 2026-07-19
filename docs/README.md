# 项目文档目录

正式文档统一放在本目录。仓库根目录只保留项目入口，图片、HTML 画板和真实页面验收图继续放在根级 `design/`。

## 根目录职责

| 目录 / 文件 | 用途 | 是否提交 Git |
|---|---|---|
| `backend/` | FastAPI 接口、AI 分析、数据模型和后端测试 | 是，环境变量、虚拟环境和本地数据库除外 |
| `mobile/` | Expo / React Native 安卓端、业务页面和移动端测试 | 是，环境变量、依赖和构建产物除外 |
| `design/` | 可直接查看的线框图、组件图、视觉稿和验收基线 | 是 |
| `docs/` | 产品、设计、架构、实施、部署和历史文档 | 是 |
| `.github/` | GitHub Actions 持续集成配置 | 是 |
| `.agents/` | 本地开发工具配置 | 按当前仓库约定保留 |
| `README.md` | 项目入口、背景、启动方法和文档导航 | 是 |
| `.gitignore` | 本地文件和敏感信息排除规则 | 是 |

## Product

产品背景、当前用户路径和异常恢复目标。

- [用户流程](./product/用户流程.md)
- [异常恢复用户流程](./product/异常恢复用户流程.md)
- [早期产品方案与比赛背景](./product/家庭化学品安全方案.md)

## Design

页面结构、视觉边界和组件拆分。

- [手机端页面线框图](./design/手机端页面线框图.md)
- [异常恢复页面线框图](./design/异常恢复页面线框图.md)
- [移动端视觉规范](./design/移动端视觉规范.md)
- [前端组件图与设计令牌映射](./design/前端组件图与设计令牌映射.md)
- [可视化资源目录](../design/README.md)

## Architecture

系统边界、数据流、状态所有权和技术决策。

- [架构图集](./architecture/README.md)
- [完整架构方案](./architecture/架构方案.md)

## Implementation

按阶段保留的实施计划和验收标准。

- [第一条功能垂直切片](./implementation/第一条功能垂直切片实施计划.md)
- [第二条功能垂直切片](./implementation/第二条功能垂直切片实施计划.md)
- [第三条功能垂直切片](./implementation/第三条功能垂直切片实施计划.md)
- [第四条功能垂直切片](./implementation/第四条功能垂直切片实施计划.md)
- [第五条功能垂直切片](./implementation/第五条功能垂直切片实施计划.md)
- [单场景快速检查实施计划](./implementation/单场景快速检查实施计划.md)
- [异常恢复第一条功能切片](./implementation/异常恢复第一条功能垂直切片实施计划.md)

## Operations

- [部署指南](./operations/部署指南.md)
- [后端说明](../backend/README.md)
- [移动端目录](../mobile/)

## History

- [开发日记](./history/开发日记.md)

## 维护规则

- 产品目标变化先更新 `product/`，再修改架构和实现。
- 页面结构与视觉决策放在 `design/`，PNG/HTML 产物放在根级 `design/`。
- 跨模块技术决策写入 `architecture/架构方案.md`。
- 每条编码切片只在 `implementation/` 新增一份计划，完成后保留作历史记录。
- 本地日志、二维码、构建输出、数据库、依赖目录和模型生成草图不进入 Git。

## 本地文件清理规则

以下内容可在服务停止后删除，需要时由工具重新生成：

- `backend/.venv/`：Python 虚拟环境，删除后需重新安装依赖。
- `mobile/node_modules/`：移动端依赖，删除后需重新执行 `npm install`。
- `mobile/.expo/`、`mobile/dist/`、`output/`：开发或构建输出。
- `.pytest_cache/`、`__pycache__/`：Python 测试与解释器缓存。
- `*.log`、`preview/`、`preview_*.html`、`images/generated*.jpg`：日志和临时预览。

以下内容默认保留，除非明确接受相应影响：

- `backend/.env`、`mobile/.env`：本机配置；不要提交或分享。
- `backend/data/`：本地检查历史；删除会丢失本机历史数据。
- `design/` 中已纳入评审或回归的 PNG / HTML：属于正式设计资产，不按临时截图清理。
