# Stage 5 全链路联调与 Visual QA 矩阵

> 验证目标：Stage 3 后端 + Stage 4 移动端真实接口与真实组件渲染。
> 不修改业务契约，不复制 QA 假组件；使用真实后端 HTTP 接口 + 受控 MockAI（经过正式路由、鉴权、FormData 解析与移动端 API）。

- 日期：2026-08-12
- 后端：`AI_PROVIDER=mock`，本地实例 `127.0.0.1:8001`，鉴权 `Bearer qa_stage5_token`
- 移动端：Expo Web（`dist` 静态服务 `127.0.0.1:8090`），API 指向本地后端，携带鉴权 token
- 仓库数据：蓝月亮洗衣液（laundry）、威猛先生洁厕灵（toilet_cleaner/盐酸）、84 消毒液（disinfectant/次氯酸钠）
- 触发问题经真实 `POST /api/assistant/ask`（multipart FormData + Bearer 鉴权 + X-Real-IP 限流分离）与 MockAI 关键词意图提取。

## 1. 状态覆盖矩阵

| 状态 | 触发输入（真实问题） | 后端 status | 移动端 UI 断言 | 结果 |
|------|---------------------|------------|----------------|------|
| local_hit | 可水洗织物上的油污怎么清洗 | `local_hit` | 油污知识卡（适用材质/处理步骤/安全提醒/查看依据）+ 蓝月亮洗衣液推荐卡（√推荐/查看产品→）+ 来源分层（本地知识库/我家仓库） | ✅ |
| local_hit_no_inventory | 可水洗织物上的胶带残留怎么去除 | `local_hit_no_inventory` | 胶渍知识卡保留 +「库存中暂无通过安全校验的合适产品」+ 无产品卡/无查看产品入口 | ✅ |
| insufficient | 油污怎么清洗（无材质词） | `insufficient` | 无知识卡/无产品卡；显示「现有信息不足…可以补充污渍类型、材质或场景后重试」追问文案 | ✅ |
| no_match | 今天天气怎么样 | `no_match` | 无知识卡/无产品卡/无外部来源；显示「暂无足够依据给出具体建议」 | ✅ |
| external_hit | 今天天气（`allowExternalSearch=true` + `EXTERNAL_KNOWLEDGE_ENABLED=true` + 受控 mock 源） | `external_hit` | 接口返回 `externalSources`（safe.gov）✓；移动端真实 UI 默认关闭外部搜索，UI 渲染由纯函数与单元测试覆盖 | ✅（接口）/ ⚠️ UI 见缺陷清单 |
| external_fail | 由后端单元测试覆盖（`test_external_fail`） | `external_fail` | 不显示外部建议 | ✅（单测） |
| outOfScope | 误食了漂白剂怎么办 | `out_of_scope=true` | 隐藏产品/知识/外部操作；显示「超出回答范围」急救警示；无产品卡/无知识卡 | ✅ |
| critical | 从 84 产品详情「问问助手」进入（contextProductId）问「这个产品怎么安全使用」 | `no_match` + critical 警告 | 「含氯消毒剂 × 酸性清洁剂」严重警告置顶 +「查看关系详情→」跳转 + 安全规则来源 | ✅ |

## 2. 组件渲染矩阵

| 组件 | 断言 | 结果 |
|------|------|------|
| AssistantScreen | 真实问答界面，含输入框/相册/拍照/发送 | ✅ |
| AssistantMessage | 分层渲染：回答→安全提醒→知识/库存→产品→外部→通用 | ✅ |
| KnowledgeAdviceCard | 知识卡含适用材质/处理步骤/安全提醒/来源/查看依据；展开后含 entryId/version/审核日期/不适用材质/tagCondition | ✅ |
| ExternalSourceCard | 白名单校验；非 https/端口/userinfo 显示「来源不可访问」，不调 Linking.openURL | ✅（纯函数测试） |
| SourceLayersCard | 来源分层 local_kb → warehouse → rule → external | ✅ |
| InventoryAdviceCard | 仅 local_hit 渲染；local_hit_no_inventory 不泄漏 | ✅ |
| SafetyWarningCard | critical 置顶（sortWarningsBySeverity）；attention 常规 | ✅ |

## 3. 安全边界验证

| 检查项 | 结果 |
|--------|------|
| 默认外部搜索关闭（allowExternalSearch=false）不伪造外部命中 | ✅ no_match/insufficient 均无 externalSources |
| 后端外部源仅 https + 白名单（filter_allowed） | ✅ |
| 移动端 canOpenExternalSource：https/port==''/user==''/pass==''/hostname 精确白名单 | ✅（单测 172 项含防绕过） |
| outOfScope 隐藏产品/知识/外部操作 | ✅ |
| local_hit_no_inventory 不渲染产品操作卡/查看产品 | ✅ |
| 鉴权 401（无/错 token） | ✅ |
| 限流（assistant 每客户端） | ✅ 429 RATE_LIMITED 观察到 |

## 4. 验证命令结果

| 命令 | 结果 |
|------|------|
| backend pytest 全量 | 256 passed |
| npm run test:v2 | 172 passed |
| TypeScript `tsc --noEmit` | 通过 |
| Expo Web `expo export --platform web` | 成功 |
| `git diff --check` | 通过 |
| 截图内容断言 | 全部通过（见 screenshots.json） |

## 5. 待执行项（未在本环境完成）

- Android 真机验证（问答入口/拍照相册权限/图片+文字发送/返回仓库/键盘与滚动/网络失败重试）——需真机，标记为**待执行**，未写成通过。
- iOS 真机验证——**待执行**。
- external_hit 的移动端真实 UI 截图——移动端真实 UI 默认关闭外部搜索且无开关，无法通过真实交互触发，见缺陷清单。
