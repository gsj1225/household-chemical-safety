# Stage 5 缺陷清单

> 依据 Stage 5 全链路联调与 Visual QA 记录。严重级别：P0 阻塞 / P1 高 / P2 中 / P3 低 / INFO 观察。

## P1 — 移动端与后端外部域名白名单需在接入真实外部检索时保持同步

- **现象**：当前外部真实网络未接入，移动端 `EXTERNAL_SOURCE_ALLOWLIST`（`mobile/src/config/externalAllowlist.ts`）与后端 `EXTERNAL_KNOWLEDGE_ALLOWLIST` 均为空，`ExternalKnowledgeProvider` 统一返回 `external_fail`，不产生任何外部来源。
- **影响**：暂无实际外部来源需要打开；`ExternalSourceCard` 不会显示（无 external_hit）。
- **建议**：日后接入真实外部检索时，将后端 allowlist 的权威域名同步到移动端 `EXTERNAL_SOURCE_ALLOWLIST`，并走审核流程，两端保持一致。

## P2 — external_hit 暂不宣称完成（外部未接入真实网络）

- **现象**：`ExternalKnowledgeProvider` 已彻底移除生产 Mock 来源（不再构造伪造标题/URL/检索日期，不再返回 `externalSources`）；外部真实网络尚未接入，`search` 统一返回 `failed=True` → `external_fail`。
- **影响**：`external_hit` 场景无法在真实链路上触发，**暂不宣称完成**；`ExternalSourceCard` 的白名单/端口/用户信息拒绝逻辑由 `canOpenExternalSource` 纯函数测试覆盖（172 项全过）。
- **建议**：接入真实外部检索后，两端（移动端 `EXTERNAL_SOURCE_ALLOWLIST` / 后端 `EXTERNAL_KNOWLEDGE_ALLOWLIST`）白名单保持一致，再做 external_hit 验收。

## P2 — React Native Web 滚动容器高度问题（QA 截图相关）

- **现象**：Expo Web 下 `document.body.scrollHeight` 仅 666px，而消息列表实际内容高度约 1254px（溢出到内部 `overflow:auto` 容器）。使用 `window.scrollTo`/`full_page` 截图无法捕获列表底部；需定位内部滚动容器并设置 `scrollTop`。
- **影响**：仅影响 Web 端视觉 QA 截图方式，不影响真机（RN 原生滚动容器正常）。已在 QA 中通过脚本滚动内部容器解决。
- **建议**：真机/原生环境不受影响，无需修复；Web 端可作为已知渲染差异记录。

## P2 — 当前知识库无 provisional 条目，provisional 固定文案无法经真实接口触发

- **现象**：`backend/data/knowledge/*.json` 共 10 条，全部 `confidence=reviewed`，无 `provisional` 条目。
- **影响**：`insufficient` 由材质未知（surface 为空）触发并显示"补充污渍类型、材质或场景"追问文案；`pendingKnowledgeNotice`（provisional 固定文案）分支因无 provisional 数据无法经真实接口观测到。
- **评估**：符合当前数据现状，非缺陷；待录入 provisional 知识条目后可补充验证。

## INFO — 真实 Qwen 集成说明

- 服务端问答已切换为真实 Qwen（`AI_PROVIDER=qwen`），未配 `QWEN_API_KEY` 时明确报错，不静默回退 Mock；生产（DEBUG=false）强制 `AI_PROVIDER=qwen` 且必须配 Key。
- 早期 HTTP no_match 系 curl form-data 中文乱码所致（测试工具编码问题），真实 Qwen 链路经 Python requests（UTF-8）验证 local_hit/local_hit_no_inventory/outOfScope/no_match 全部正常。

## INFO — 助手问答限流（ASSISTANT_RATE_LIMIT_PER_MINUTE=8）

- **现象**：连续提问触发 `429 RATE_LIMITED`。
- **评估**：为真实限流机制，防止滥用；对 QA/密集自动化验证需分离客户端（本 QA 用 `X-Real-IP` 区分）。生产可接受。

## INFO — 待执行项（未写成通过）

- **问答 UI 全链路真实截图**：需重启真实 Qwen 后端 + 真实数据库，直接从真实 `AssistantScreen` 发起请求并截图。当前 `docs/qa/stage5-screenshots.json` 的截图基于本地静态服务 + 受控响应，仅证明组件渲染，**不能**宣称问答 UI 全链路通过 —— **待执行**。
- Android 真机验证：问答入口、拍照/相册权限、图片+文字发送、返回仓库、键盘与滚动、网络失败重试 —— **待执行**（需真机）。
- iOS 真机验证 —— **待执行**。
- external_hit：外部真实网络未接入，**暂不宣称完成**；当前真实行为为 `external_fail`。

## 未发现缺陷（通过项摘要）

- local_hit 知识卡/推荐卡/来源分层/查看依据（含审核日期）渲染正确。
- local_hit_no_inventory 知识卡保留、无产品操作卡/无查看产品泄漏。
- insufficient/no_match 不泄漏产品卡、知识卡、外部来源。
- outOfScope 隐藏产品/知识/外部操作，急救警示正确。
- critical 警告置顶、关系详情可跳转。
- 鉴权 401、外部默认关闭不伪造命中、白名单防绕过均正确。
