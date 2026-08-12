# Stage 5 缺陷清单

> 依据 Stage 5 全链路联调与 Visual QA 记录。严重级别：P0 阻塞 / P1 高 / P2 中 / P3 低 / INFO 观察。

## P1 — 移动端与后端外部域名白名单不一致

- **现象**：移动端 `EXTERNAL_SOURCE_ALLOWLIST` 为空（`mobile/src/config/externalAllowlist.ts`），后端 QA 配置 `EXTERNAL_KNOWLEDGE_ALLOWLIST=["safe.gov"]`。
- **影响**：即便后端在开启外部检索（`EXTERNAL_KNOWLEDGE_ENABLED=true`）时返回外部来源，移动端因 `canOpenExternalSource` 空白名单全拒，`ExternalSourceCard` 一律显示「来源不可访问」，不会打开任何链接。
- **评估**：这是**保守且安全**的默认（移动端白名单从空开始），符合"默认外部搜索关闭时不得伪造外部命中"。但两端配置需在接入真实外部检索前统一：将后端 allowlist 的权威域名同步到移动端 `EXTERNAL_SOURCE_ALLOWLIST`。
- **建议**：接入真实外部源时，两端白名单保持一致，并走审核流程。

## P2 — external_hit 移动端真实 UI 无法通过真实交互触发

- **现象**：移动端真实 UI 的 `allowExternalSearch` 默认 `false`（`assistantApi.ts`）且界面无开关；后端接口层已验证 `external_hit`（`allowExternalSearch=true` + `EXTERNAL_KNOWLEDGE_ENABLED=true` + 受控 mock 源返回 `safe.gov`）。
- **影响**：`ExternalSourceCard` 的"命中"渲染无法经真实 UI 交互截图；其白名单/端口/用户信息拒绝逻辑由 `canOpenExternalSource` 纯函数测试覆盖（172 项全过）。
- **建议**：后续如需真机验证外部来源 UI，可提供受控测试开关（仅开发环境），或由后端注入受控源后由测试入口断言。

## P2 — React Native Web 滚动容器高度问题（QA 截图相关）

- **现象**：Expo Web 下 `document.body.scrollHeight` 仅 666px，而消息列表实际内容高度约 1254px（溢出到内部 `overflow:auto` 容器）。使用 `window.scrollTo`/`full_page` 截图无法捕获列表底部；需定位内部滚动容器并设置 `scrollTop`。
- **影响**：仅影响 Web 端视觉 QA 截图方式，不影响真机（RN 原生滚动容器正常）。已在 QA 中通过脚本滚动内部容器解决。
- **建议**：真机/原生环境不受影响，无需修复；Web 端可作为已知渲染差异记录。

## P2 — 当前知识库无 provisional 条目，provisional 固定文案无法经真实接口触发

- **现象**：`backend/data/knowledge/*.json` 共 10 条，全部 `confidence=reviewed`，无 `provisional` 条目。
- **影响**：`insufficient` 由材质未知（surface 为空）触发并显示"补充污渍类型、材质或场景"追问文案；`pendingKnowledgeNotice`（provisional 固定文案）分支因无 provisional 数据无法经真实接口观测到。
- **评估**：符合当前数据现状，非缺陷；待录入 provisional 知识条目后可补充验证。

## INFO — 助手问答限流（ASSISTANT_RATE_LIMIT_PER_MINUTE=8）

- **现象**：连续提问触发 `429 RATE_LIMITED`。
- **评估**：为真实限流机制，防止滥用；对 QA/密集自动化验证需分离客户端（本 QA 用 `X-Real-IP` 区分）。生产可接受。

## INFO — 待执行项（未写成通过）

- Android 真机验证：问答入口、拍照/相册权限、图片+文字发送、返回仓库、键盘与滚动、网络失败重试 —— **待执行**（需真机）。
- iOS 真机验证 —— **待执行**。

## 未发现缺陷（通过项摘要）

- local_hit 知识卡/推荐卡/来源分层/查看依据（含审核日期）渲染正确。
- local_hit_no_inventory 知识卡保留、无产品操作卡/无查看产品泄漏。
- insufficient/no_match 不泄漏产品卡、知识卡、外部来源。
- outOfScope 隐藏产品/知识/外部操作，急救警示正确。
- critical 警告置顶、关系详情可跳转。
- 鉴权 401、外部默认关闭不伪造命中、白名单防绕过均正确。
