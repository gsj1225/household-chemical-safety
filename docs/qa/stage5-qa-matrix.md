# Stage 5 全链路联调与 Visual QA 矩阵

> 验证目标：Stage 3 后端 + Stage 4 移动端真实接口与真实组件渲染。
> 不修改业务契约，不复制 QA 假组件。
>
> **验收分两类，严禁混淆**：
> - **真实链路验收（服务端）**：真实 Qwen + 真实知识库 + 真实库存 + 正式 HTTP 路由（`POST /api/assistant/ask`）。
> - **组件视觉验收（移动端）**：真实 React 组件 + **受控响应**，仅证明 UI 渲染逻辑正确，**不代表真实问答链路通过**。
>
> 当前环境下移动端截图基于本地静态服务 + 受控响应（非真实 Qwen 后端直连截图），因此
> **问答 UI 全链路真实截图标记为「待执行」**，未写成通过。

- 日期：2026-08-12
- 后端：**真实 Qwen Provider（`AI_PROVIDER=qwen`，通义千问 qwen-flash）**，本地实例 `127.0.0.1:8001`，鉴权 `Bearer qa_stage5_token`
- 说明：生产 Mock 已彻底移除；问答正式流程使用真实 Qwen，本地知识库读真实 `backend/data/knowledge/*.json`，库存与相容性读真实数据库与 CompatibilityEngine。
- 仓库数据：蓝月亮洗衣液（laundry）、威猛先生洁厕灵（toilet_cleaner/盐酸）、84 消毒液（disinfectant/次氯酸钠）
- 真实链路验收触发问题经真实 `POST /api/assistant/ask`（multipart FormData + Bearer 鉴权 + X-Real-IP 限流分离）；**意图提取与回答组织均由真实 Qwen 完成**，本地知识库读取真实 JSON，库存与相容性读取真实 SQLite 与 CompatibilityEngine 规则。
- 组件视觉验收截图在 Expo Web（`dist` 静态服务 `127.0.0.1:8090`）下以受控响应驱动真实组件渲染，**仅证明 UI 渲染**，不宣称问答链路通过。

---

## 1. 真实链路验收（服务端：真实 Qwen + 真实知识库 + 真实库存 + 正式 HTTP 路由）

### 1.1 状态覆盖矩阵（服务端断言）

| 状态 | 触发输入（真实问题） | 后端 status | 服务端断言 | 结果 |
|------|---------------------|------------|-----------|------|
| local_hit | 可水洗织物上的油污怎么清洗 | `local_hit` | 返回知识卡（油污）+ 推荐产品「蓝月亮洗衣液」+ 来源分层 | ✅ 真实 Qwen |
| local_hit_no_inventory | 可水洗织物上的胶带残留怎么去除 | `local_hit_no_inventory` | 返回胶渍知识卡；**无**推荐产品（库存无通过安全校验的合适产品） | ✅ 真实 Qwen |
| insufficient | 油污怎么清洗（无材质词） | `insufficient` | 无知识卡/无产品卡；返回「现有信息不足…」追问 | ✅ 真实 Qwen |
| no_match | 今天天气怎么样 | `no_match` | 无知识卡/无产品卡/无外部来源；返回「暂无足够依据」 | ✅ 真实 Qwen |
| external_hit | 未接入真实外部网络 | — | 外部搜索未接真实网络，统一 `external_fail`；不构造伪造标题/URL/检索日期 | ⏸ 待接入 |
| external_fail | 后端单元测试覆盖（`test_external_fail`） | `external_fail` | 不返回 externalSources | ✅（单测） |
| outOfScope | 误食了漂白剂怎么办 | `out_of_scope=true` | 隐藏产品/知识/外部操作；返回「超出回答范围」急救警示 | ✅ 真实 Qwen |
| critical | 从 84 产品详情「问问助手」进入（contextProductId）问「这个产品怎么安全使用」 | `no_match` + critical 警告 | 「含氯消毒剂 × 酸性清洁剂」严重警告置顶 + 关系详情来源 | ✅ 真实 Qwen |

### 1.2 真实 Qwen 服务端验收记录

> 服务端问答链路已切换为真实 Qwen（`AI_PROVIDER=qwen`），本地知识库 + 真实库存数据库 + CompatibilityEngine 全链路。以下为真实 Qwen HTTP 验收结果（Python requests，UTF-8 编码，鉴权 + FormData）：

| 真实问题 | knowledgeStatus | knowledge | 库存推荐 | 结果 |
|----------|----------------|-----------|---------|------|
| 可水洗织物上的油污怎么清洗 | local_hit | 油污 | 蓝月亮洗衣液 recommended | ✅ 真实 Qwen 生成叙述 |
| 可水洗织物上的胶带残留怎么去除 | local_hit_no_inventory | 胶渍 | 无 | ✅ |
| 误食了漂白剂怎么办 | no_match（outOfScope=true） | — | 无 | ✅ 急救警示 |
| 今天天气怎么样 | no_match | — | 无 | ✅ |

> 说明：早期 HTTP 观测到 no_match 系 curl form-data 中文编码乱码所致（Qwen 收到乱码提取意图错误），改用 Python requests 以 UTF-8 正确编码后真实 Qwen 链路稳定返回 local_hit。此为测试工具编码问题，非业务缺陷。

### 1.3 可复现验收方法（不含任何密钥）

提供脚本 `backend/scripts/qa_real_qwen.py`（不含 API Key / token / 服务器地址 / 个人路径，全部经环境变量传入）。前置与运行（**命令路径统一为方案 A**）：

```bash
# 前置条件（缺任一即明确失败，不伪造结果）：
#   1. QWEN_API_KEY 已配置（由 backend/.env 提供，或用环境变量覆盖）
#   2. 后端 DEMO_ACCESS_TOKEN 已配置
#   3. 真实后端已启动（AI_PROVIDER=qwen）
#   4. 真实库存中已录入目标产品「蓝月亮洗衣液」（laundry）及必要成分/标签信息
#      （脚本启动时会先调用真实库存接口检查，缺少时输出「请先录入蓝月亮洗衣液」并以退出码 1 结束）

# 1) 启动真实后端（在 backend 目录内）
cd backend
AI_PROVIDER=qwen python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

# 2) 另开终端，进入 backend 后运行验收脚本（QA_TOKEN 设为后端 DEMO_ACCESS_TOKEN）
cd backend
QA_TOKEN=<后端 DEMO_ACCESS_TOKEN> python scripts/qa_real_qwen.py
# 可选：QA_API_BASE=http://127.0.0.1:8001/api（默认即此值）
```

脚本启动时先调用真实库存接口 `GET /api/inventory/products` 检查目标产品是否存在；缺少目标产品时输出「请先录入蓝月亮洗衣液」，退出码 1，**不使用 Mock 或自动伪造产品补齐**。随后以 UTF-8 multipart 请求 + Bearer 鉴权发送 local_hit / local_hit_no_inventory / outOfScope / no_match 四个问题，并对 `knowledgeStatus`、推荐产品名、`outOfScope` 等关键字段断言；任一失败即退出码 1。**不配置 QWEN_API_KEY 时不会伪造 Mock 结果，本脚本仅向真实后端发请求。**

---

## 2. 组件视觉验收（移动端：真实 React 组件 + 受控响应，仅证明 UI 渲染）

> 本节截图来自 Expo Web 静态服务 + 受控响应驱动真实组件渲染，**仅证明组件在给定数据下的 UI 渲染正确**，不宣称真实问答链路通过。真实问答 UI 全链路截图见「3. 待执行项」。

### 2.1 组件渲染矩阵

| 组件 | 断言 | 结果 |
|------|------|------|
| AssistantScreen | 真实问答界面，含输入框/相册/拍照/发送 | ✅（受控响应） |
| AssistantMessage | 分层渲染：回答→安全提醒→知识/库存→产品→外部→通用 | ✅（受控响应） |
| KnowledgeAdviceCard | 知识卡含适用材质/处理步骤/安全提醒/来源/查看依据；展开后含 entryId/version/审核日期/不适用材质/tagCondition | ✅（受控响应） |
| ExternalSourceCard | 白名单校验；非 https/端口/userinfo 显示「来源不可访问」，不调 Linking.openURL | ✅（纯函数测试） |
| SourceLayersCard | 来源分层 local_kb → warehouse → rule → external | ✅（受控响应） |
| InventoryAdviceCard | 仅 local_hit 渲染；local_hit_no_inventory 不泄漏 | ✅（受控响应） |
| SafetyWarningCard | critical 置顶（sortWarningsBySeverity）；attention 常规 | ✅（受控响应） |

### 2.2 截图断言（受控响应）

- 截图目录：`deliverables/stage5/screenshots/`
- 内容断言方法：真实组件在受控响应下渲染后取 DOM innerText 断言 + 视觉模型复核；**截图均为真实组件渲染，非 QA 假页面，但输入为受控响应**。
- 详细断言见 `docs/qa/stage5-screenshots.json`（8 张截图断言全部通过，均基于受控响应，不宣称真实问答链路）。

---

## 3. 待执行项（未在本环境完成）

> 以下项在当前环境下无法完成真实验收，一律标记为**待执行**，不写成通过。

- **问答 UI 全链路真实截图**：需重启真实 Qwen 后端 + 真实数据库，直接从真实 `AssistantScreen` 发起请求并截图。当前移动端截图基于本地静态服务 + 受控响应，仅证明组件渲染，**不能**宣称问答 UI 全链路通过。
- **Android 真机验证**：问答入口/拍照相册权限/图片+文字发送/返回仓库/键盘与滚动/网络失败重试 —— **待执行**（需真机）。
- **iOS 真机验证** —— **待执行**。
- **external_hit**：外部真实网络未接入，**继续标记为未完成**；当前真实行为为 `external_fail`，不构造伪造外部来源。

---

## 4. 安全边界验证

| 检查项 | 结果 |
|--------|------|
| 默认外部搜索关闭（allowExternalSearch=false）不伪造外部命中 | ✅ no_match/insufficient 均无 externalSources |
| 后端外部源仅 https + 白名单（filter_allowed） | ✅ |
| 移动端 canOpenExternalSource：https/port==''/user==''/pass==''/hostname 精确白名单 | ✅（单测 172 项含防绕过） |
| outOfScope 隐藏产品/知识/外部操作 | ✅ |
| local_hit_no_inventory 不渲染产品操作卡/查看产品 | ✅ |
| 鉴权 401（无/错 token） | ✅ |
| 限流（assistant 每客户端） | ✅ 429 RATE_LIMITED 观察到 |
| 生产/演示默认模板禁止 Mock（AI_PROVIDER=mock 不得出现） | ✅ 配置测试覆盖 |

## 5. 验证命令结果

| 命令 | 结果 |
|------|------|
| backend pytest 全量 | 通过（含新增模板非 Mock 测试） |
| npm run test:v2 | 通过 |
| TypeScript `tsc --noEmit` | 通过 |
| Expo Web `expo export --platform web` | 成功 |
| `git diff --check` | 通过 |
| 截图内容断言（受控响应） | 全部通过（见 screenshots.json） |
