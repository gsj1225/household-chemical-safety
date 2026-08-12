# 知识库优先的家庭化学品助手 — Stage 2 设计（问答结果页与来源展示）

> 版本：v1.4.1（修订：清除 provisional 残留歧义——KnowledgeAdviceCard 仅处理 reviewed，provisional 仅经 pendingKnowledgeNotice 文案展示）
> 日期：2026-08-12

## 本版本修订内容（v1.3 → v1.4）

1. **超范围判断前置**：`SafetyScopeClassifier` 提到流程最前，`outOfScope=true` 时立即返回，不调用任何 LLM、不检索知识库。
2. **补全 `knowledgeStatus` 状态转换**：6 种状态完整转换表 + 每种后端测试要求。
3. **规定禁止调用第二次 LLM 的状态**：`out_of_scope`/`no_match`/`insufficient`/`external_fail` 由后端固定模板返回；仅当有已确认 reviewed 知识或可靠 external 来源时才组织回答。
4. **解决 provisional UI 矛盾**：新增独立字段 `pendingKnowledgeNotice`，不渲染 `KnowledgeAdviceCard`，不含任何产品建议/步骤/比例/时间/化学操作。
> 上游：`docs/product/知识库优先的家庭化学品助手流程.md`（Stage 1，已确认）
> 前置决策（已锁定）：
> - 现有 Stage 4 安全编排在**现有基础上演进**，不重写
> - 本地知识库采用 **JSON 文件 + 仓库版本管理**，首期关键词/别名/材质/场景匹配，暂不向量检索
> - 外部检索**预留 `KnowledgeProvider` 接口 + 环境变量开关，默认关闭，首期仅接口 + Mock**

---

## 1. 目标与范围

把当前"LLM + 库存 + 相容性"的问答，升级为"**知识库优先**"的三层架构。**LLM 参与两次、且每次都受约束**：

```text
用户问题/照片
→ 输入标准化
→ SafetyScopeClassifier（超范围判定，前置）
     ├─ 涉及误食/中毒/吸入/身体不适/急救 → outOfScope=true
     │    立即返回，不调用意图提取 LLM、不检索知识库、不调用回答组织 LLM
     │    清空 knowledge / inventoryAdvice / generalAdvice / safetyWarnings
     └─ 未超范围 → 进入下面流程

未超范围时：
→ 调用① 意图提取：LLM → KnowledgeIntentDraft（污渍/材质/场景，不生成结论、不决定 entry_id）
→ 本地知识库检索（reviewed 高置信即止）
→ 库存按类别筛选候选 → 标签/成分/危险性/信息完整性
→ CompatibilityEngine 复核（critical 最高优先级）
→ knowledgeStatus 状态转换
→ 满足条件时才调用② 组织回答：LLM 只接收后端已确认的知识/产品/规则/警告 → AssistantNarrativeDraft（answer）
→ 展示：回答 + 知识库建议 + 我的仓库 + 安全提醒 + 来源分层
```

本 Stage 2 只产出**设计**，不修改现有 UI/Store/API/业务代码。设计经确认后进入 Stage 3（后端知识库）与 Stage 4（移动端 UI）。

**核心原则：LLM 不越权。** 产品推荐、安全警告、知识步骤、`out_of_scope` 全部由后端生成；LLM 只输出意图（调用①）与组织后的文字（调用②），任何夹带的建议/安全结论一律被忽略或覆盖。

---

## 2. 后端数据模型扩展

> 所有模型在 Pydantic 中**实际书写 `Field(alias=...)`**（camelCase），不仅是在文档里列出。

### 2.1 `KnowledgeEntry`（知识库条目，仓库内 JSON）

首期存储在 `backend/data/knowledge/*.json`（随仓库审查与版本管理）。每条带**强类型校验**，非法 JSON 启动即失败：

```json
{
  "id": "stain-oil-on-washable-fabric",
  "topic": "油脂类污渍",
  "aliases": ["油污", "食用油", "油渍"],
  "surfaces": ["可水洗织物"],
  "excluded_surfaces": ["需干洗面料", "未经确认的特殊面料"],
  "scene": ["厨房", "衣物"],
  "steps": [
    { "order": 1, "text": "先吸附或轻按，不要反复摩擦" },
    { "order": 2, "text": "按洗涤标签选择适用清洁产品" },
    { "order": 3, "text": "在不显眼处局部测试" }
  ],
  "allowed_product_categories": ["laundry", "stain_remover"],
  "warnings": ["先确认材质与产品标签"],
  "prohibited_actions": ["不得混合不同清洁产品"],
  "stop_conditions": ["若出现变色或破损立即停止"],
  "tag_condition": "使用前必须核对产品标签的适用材质",
  "sources": [{ "type": "local_kb", "title": "家庭安全知识库", "url": "" }],
  "reviewed_at": "2026-08-12",
  "version": "1.0",
  "confidence": "reviewed"
}
```

**字段校验**：
- `confidence: Literal["reviewed", "provisional"]`
- `sources: list[SourceRef]`，`type ∈ {local_kb, warehouse, rule, external}`
- `version`：语义化版本格式（如 `1.0`），非空
- `reviewed_at`：`YYYY-MM-DD` 日期格式
- `id`：唯一、小写连字符命名
- 禁止空 `steps`（`reviewed` 条目必须含可执行步骤）

### 2.2 `SourceRef`（统一来源引用，四类）

```python
class SourceRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: Literal["local_kb", "warehouse", "rule", "external"]
    title: str
    domain: str = ""                        # 外部域名（外部必填）
    url: str = ""                           # 外部必填，仅 https
    retrieved_at: str | None = Field(default=None, alias="retrievedAt")  # YYYY-MM-DD
    ref: str = ""                           # 知识条目 id / 产品 id / 规则 id（如 RULE-001）
    version: str = ""                       # 知识库版本
```

| type | 含义 | 示例 title |
|---|---|---|
| `local_kb` | 本地家庭安全知识库 | 家庭安全知识库 |
| `warehouse` | 我的化学品库（产品详情） | 蓝月亮洗衣液 |
| `rule` | 相容性引擎安全规则 | 含氯消毒剂 × 酸性清洁剂 · RULE-001 |
| `external` | 受控外部资料 | CDC · Cleaning and Disinfecting with Bleach |

**去重与排序**：`sources` 按 `(type, ref)` 去重；展示顺序固定 `local_kb → warehouse → rule → external`。

**外部安全**：外部 `url` 只允许 `https`；`[打开来源]` 跳转前校验 `domain` 在白名单内，禁止跳转非白名单域名。

### 2.3 `KnowledgeQuery`（后端标准化的检索条件）

```python
class KnowledgeQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    topic: str | None = None                          # 标准主题词，单值
    aliases: list[str] = Field(default_factory=list)  # 已归一化别名（多值）
    surface: str | None = None                        # 标准表面词，单值
    scene: str | None = None                          # 标准场景词，单值
    already_used_product_ids: list[str] = Field(default_factory=list, alias="alreadyUsedProductIds")
```

规则：`topic/surface/scene` 单值标准词；别名归一化；`already_used_product_ids` 用产品 ID 非名称；照片识别只提取污渍/材质/场景，不生成清洁结论。

### 2.4 两次 LLM 调用的产物模型（拆分）

**调用①（意图提取）**：

```python
class KnowledgeIntent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    topic: str | None = None
    surface: str | None = None
    scene: str | None = None
    aliases: list[str] = Field(default_factory=list)

class KnowledgeIntentDraft(BaseModel):
    knowledge_intent: KnowledgeIntent | None = None   # 唯一产物
```

**调用②（组织回答）**：

```python
class AssistantNarrativeDraft(BaseModel):
    answer: str = ""                                   # 唯一产物
```

> **两次调用隔离**：调用① 只产出意图，不产出 `answer`；调用② 只产出 `answer`，其输入是**后端已确认的上下文束**（知识/产品/规则/警告），**不得重新生成这些内容**。不存在一个同时携带 `answer` + 意图的草稿模型。

### 2.5 `KnowledgeMatch` / `KnowledgeResult`（检索结果）

```python
class KnowledgeMatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    entry: KnowledgeEntry
    matched_fields: list[str] = Field(default_factory=list, alias="matchedFields")
    score: float                                     # 0.0 ~ 1.0

class KnowledgeResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    local_status: Literal["local_hit", "insufficient", "no_match"] = Field(alias="localStatus")
    matches: list[KnowledgeMatch] = Field(default_factory=list)
```

**检索常量（固定）**：
- `TOP_K = 3`
- `HIT_THRESHOLD = 0.5`
- 排序：score 降序 → `reviewed` 优先 → `version` 新者优先 → `id` 字典序兜底

### 2.6 `KnowledgeEvidence`（仅 reviewed，多来源）

```python
class KnowledgeEvidence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    entry_id: str = Field(alias="entryId")
    topic: str
    surfaces: list[str] = Field(default_factory=list)
    excluded_surfaces: list[str] = Field(default_factory=list, alias="excludedSurfaces")
    steps: list[str] = Field(default_factory=list)             # 唯一可执行处理步骤
    warnings: list[str] = Field(default_factory=list)          # → safetyWarnings
    prohibited_actions: list[str] = Field(default_factory=list, alias="prohibitedActions")
    stop_conditions: list[str] = Field(default_factory=list, alias="stopConditions")
    tag_condition: str = Field(default="", alias="tagCondition")
    sources: list[SourceRef] = Field(default_factory=list)     # 多来源
    confidence: Literal["reviewed"]                            # provisional 不进入
```

> **provisional 安全（v1.4）**：`provisional` 一律**不进入** `knowledge`，不返回条目内容、步骤、警告或来源详情，不渲染 `KnowledgeAdviceCard`。仅通过独立字段 `pendingKnowledgeNotice`（或固定文案）显示："存在待审核资料，尚未通过审核，暂不提供操作建议"。该字段**不得包含**任何产品建议、清洁步骤、比例、时间或化学操作。

### 2.7 `AssistantResponse` 扩展（兼容旧字段）

```python
class AssistantResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    answer: str
    needs_clarification: bool = Field(alias="needsClarification")
    clarification_questions: list[str] = Field(default_factory=list, alias="clarificationQuestions")
    inventory_advice: list[AssistantProductAdvice] = Field(default_factory=list, alias="inventoryAdvice")
    general_advice: list[str] = Field(default_factory=list, alias="generalAdvice")  # 新流程默认空
    safety_warnings: list[AssistantSafetyWarning] = Field(default_factory=list, alias="safetyWarnings")
    out_of_scope: bool = Field(False, alias="outOfScope")
    evidence: list[str] = Field(default_factory=list)
    # ── 新增 ──
    knowledge: list[KnowledgeEvidence] = Field(default_factory=list, alias="knowledge")
    knowledge_status: Literal[
        "local_hit", "local_hit_no_inventory", "external_hit",
        "insufficient", "no_match", "external_fail",
    ] = Field("no_match", alias="knowledgeStatus")
    external_sources: list[SourceRef] = Field(default_factory=list, alias="externalSources")
    sources: list[SourceRef] = Field(default_factory=list)
    # provisional 提示（v1.4）：仅文案，不含任何产品/步骤/比例/时间/化学操作
    pending_knowledge_notice: str = Field(default="", alias="pendingKnowledgeNotice")
```

`knowledgeStatus` 只表达"知识获取状态"；`critical`→`safetyWarnings`、`needs_info`→`needsClarification`/产品信息、`out_of_scope`→`outOfScope`。

---

## 3. 本地知识库检索（LocalKnowledgeProvider）

- **存储**：`backend/data/knowledge/*.json`，`KnowledgeRepository` 启动时加载并校验（§2.1），非法条目启动失败。
- **匹配**（基于 `KnowledgeQuery`，首期无向量）：
  1. 别名/关键词：`aliases` + `topic` 与 `query.topic/aliases` 匹配（加权 3）
  2. 材质/表面：`surfaces` 与 `query.surface` 匹配（加权 2）
  3. 场景：`scene` 与 `query.scene` 匹配（加权 1）
  4. 得分归一化到 `0~1`，≥ `HIT_THRESHOLD=0.5` → hit
- 仅 `reviewed` 可作 `local_hit`；`provisional` → `insufficient`。
- 高置信 `local_hit` 时不访问外部网络。

---

## 4. 安全编排集成（`_assemble` 演进）

**调用顺序固定，超范围判定前置，两次 LLM**：

```text
输入标准化
→ SafetyScopeClassifier（前置）
    ├─ 涉及误食/中毒/吸入/身体不适/急救 → outOfScope=true
    │    立即返回，不调用意图提取 LLM、不检索知识库、不调用回答组织 LLM
    │    清空 knowledge / inventoryAdvice / generalAdvice / safetyWarnings
    └─ 未超范围 → 继续
调用① LLM 提取意图 → KnowledgeIntentDraft
  → LocalKnowledgeProvider.search(KnowledgeQuery) → KnowledgeRepository 回填
  → 库存候选：allowed_product_categories 只筛候选 → 标签/成分/危险性/信息完整性
  → CompatibilityEngine 复核（critical 最高优先级）
  → knowledgeStatus 状态转换（§4.4）
  → 满足门槛时：调用② LLM 组织回答 → AssistantNarrativeDraft（仅 answer）
```

### 4.5 第二次 LLM 调用门槛（v1.4）

**禁止调用回答组织 LLM 的状态**（由后端固定模板返回）：

- `out_of_scope`
- `no_match`
- `insufficient`
- `external_fail`

**允许调用第二次 LLM**：仅当存在已确认的 `reviewed` 知识或可靠 `external` 来源时。

**越权测试要求**：第二次 LLM 即使返回未经来源支持的产品名、化学步骤、稀释比例、接触时间或危险结论，后端也**必须忽略**，不得进入最终响应。

### 4.1 `KnowledgeProvider` 接口

```python
class KnowledgeProvider(ABC):
    async def search(self, query: KnowledgeQuery) -> KnowledgeResult:
        ...
```

- `LocalKnowledgeProvider`：检索本地 JSON（首期唯一生效）
- `ExternalKnowledgeProvider`：受控白名单检索，**首期仅接口 + Mock，不开启网络搜索**
- 组合：`local ∈ {insufficient, no_match}` 且 **用户授权 && `EXTERNAL_KNOWLEDGE_ENABLED` && 白名单命中** 才进外部

### 4.2 环境变量（默认关闭外部）

```text
EXTERNAL_KNOWLEDGE_ENABLED=false
EXTERNAL_KNOWLEDGE_ALLOWLIST=...
EXTERNAL_KNOWLEDGE_TIMEOUT_SECONDS=5
```

### 4.3 外部搜索的三重门禁

访问外部服务的**全部条件**必须同时成立：

```text
用户授权 allowExternalSearch=true（照片另需 allowExternalPhotoUpload=true）
&& EXTERNAL_KNOWLEDGE_ENABLED=true
&& 目标来源通过白名单
```

否则不得访问任何外部服务。

### 4.4 `knowledgeStatus` 状态转换规则（固定，v1.4 补全）

| 前置条件 | 结果状态 | 后端测试要求 |
|---|---|---|
| 本地 reviewed 完整命中 + 有安全合格库存 | `local_hit` | 返回 `knowledge` + `sources` 含 `local_kb` + `inventory_advice` 非空 |
| 本地 reviewed 完整命中 + 无安全合格库存 | `local_hit_no_inventory` | `inventory_advice` 为空 + 知识库建议仍返回 |
| 本地部分匹配，或仅 provisional 命中 + 外部关闭/未授权 | `insufficient` | 无可执行步骤，仅 `pendingKnowledgeNotice` 或不展示 |
| 本地完全无匹配 + 外部关闭/未授权 | `no_match` | 无 `knowledge`，无 `external_sources`，后端固定模板 |
| 本地不足 + 外部授权、环境开启、白名单命中 | `external_hit` | 返回 `externalSources`（title/domain/url/retrieved_at） |
| 本地不足 + 外部流程失败或来源不可靠 | `external_fail` | 无外部来源，LLM 不补全，固定模板 |

> 状态转换是**确定性的**：由 `local_status`（来自 `KnowledgeResult`）+ 外部开关/结果共同推出，不依赖 LLM。

### 4.5 SafetyScopeClassifier（`out_of_scope` 后端判定，前置）

`SafetyScopeClassifier` 在**输入标准化之后、任何 LLM 调用与知识库检索之前**执行。判定命中即短路返回。

```python
class SafetyScopeClassifier:
    """判定是否超范围，不依赖 LLM 返回字段，且早于一切 LLM 调用。
    方案 A：仅接收文字 question，不做图片视觉判定。
    图片首期只用于污渍/材质/场景识别，不用于事故视觉判定。"""
    def is_out_of_scope(self, question: str) -> bool:
        # 关键词/规则：误食、误饮、中毒、吸入、身体不适、急救、洗胃、送医...
        ...
```

- `is_out_of_scope()=True` → `outOfScope=true`，**立即返回**：不调用意图提取 LLM、不检索知识库、不调用回答组织 LLM；清空 `knowledge`/`inventory_advice`/`general_advice`/`safety_warnings`，由后端固定模板组织回复。
- 只有未超范围才进入后续流程。
- 必须覆盖**医疗/中毒/误食/吸入/身体不适/急救**测试用例，且与 LLM 返回值无关。

### 4.6 产品推荐判断链（类别 ≠ 推荐）

```text
知识条目适用条件（surface / tag_condition / excluded_surfaces）
→ 产品类别匹配（只筛候选）
→ 产品标签 / 成分 / 危险性检查
→ 产品信息完整性检查（needs_information → 只能"待确认"，不推荐使用）
→ CompatibilityEngine 检查
→ 才显示"推荐 / 待确认"
```

### 4.7 知识内容映射

- `knowledge.steps`：唯一可执行处理步骤。
- 知识条目 `warnings` / `prohibited_actions` / `stop_conditions`：只进入 `safetyWarnings`（非 critical 级别，除非引擎升级为 critical），不重复展示为操作步骤。
- 新知识库流程中 **`generalAdvice` 默认为空**，仅用于兼容旧接口或外部资料的非产品建议。

### 4.8 外部搜索的隐私与安全边界

`AssistantAskInput` 增加：

```python
allow_external_search: bool = Field(False, alias="allowExternalSearch")
allow_external_photo_upload: bool = Field(False, alias="allowExternalPhotoUpload")
```

- 默认关闭；开启前需用户同意；照片不默认上传（需 `allowExternalPhotoUpload`）。
- 不向外部发送完整库存列表与产品成分；外部内容不写入本地知识库。
- 外部结果过滤提示词注入与危险操作；来源必须含标题/域名/URL/检索时间，URL 仅 `https`。
- 外部检索超时/无来源/不可靠 → `knowledgeStatus=external_fail`，LLM 不得自行补全。

---

## 5. 结果页 UI 重设计（移动端）

### 5.1 分层布局（从上到下）

```
① 回答（调用② LLM 组织文本）
② 【知识库建议】KnowledgeAdviceCard      ← 新增
③ 【结合我家仓库】InventoryAdviceCard     ← 复用（来源=warehouse）
④ 【通用方法】knowledge.steps（唯一可执行步骤）；未命中则"暂无足够依据"
⑤ 【安全提醒】SafetyWarningCard          ← 复用（知识 warnings + 引擎 critical）
⑥ 【外部资料补充】ExternalSourceCard     ← 新增（仅 external_hit）
⑦ 【来源】SourceLayersCard（四类标签汇总）← 新增
⑧ 追问 / 超范围拒答                      ← 复用
```

### 5.2 来源卡片（不展示长 URL）

| 来源类型 | 卡片显示 |
|---|---|
| 家庭安全知识库 | `家庭安全知识库` / `油脂类污渍 · v1.0 · 审核日期` |
| 我的化学品库 | `我的化学品库` / `蓝月亮洗衣液 · 产品详情` |
| 安全规则 | `安全规则` / `含氯消毒剂 × 酸性清洁剂 · 规则 RULE-001` |
| 外部资料 | `外部资料` / `CDC · Cleaning and Disinfecting with Bleach` / `2026-08-12 检索` / `[打开来源]` |

- 来源卡片不直接展示长 URL；外部资料经 `[打开来源]` 跳转，且**仅限 https 白名单域名**。
- 知识条目 `entryId`/版本/审核日期放「查看依据」展开区。
- **provisional（v1.4）**：不渲染 `KnowledgeAdviceCard`；仅当 `pendingKnowledgeNotice` 非空时显示其固定文案"存在待审核资料，尚未通过审核，暂不提供操作建议"。

### 5.3 新增组件

| 组件 | 职责 | 数据 |
|---|---|---|
| `KnowledgeAdviceCard` | 仅展示已审核 reviewed 知识条目的主题、适用材质、步骤、来源；**不处理 provisional** | `KnowledgeEvidence` |
| `ExternalSourceCard` | 外部来源：标题/域名/检索时间 +「外部资料」徽章 + `[打开来源]` | `SourceRef(type=external)` |
| `SourceLayersCard` | 四类来源汇总（固定顺序） | `sources[]` |

复用：`InventoryAdviceCard`、`SafetyWarningCard`、`ClarificationPrompt`、`AssistantMessage`。

### 5.4 `AssistantMessage` 渲染逻辑（按 knowledgeStatus）

| knowledgeStatus | 显示 |
|---|---|
| `local_hit` | 知识库 + 我的仓库 + 安全提醒 + 来源 |
| `local_hit_no_inventory` | 知识库 +「库存无合适产品」+ 通用方法 |
| `insufficient` | 「暂无足够依据」+ 追问；若为 provisional 则显示 `pendingKnowledgeNotice` 文案（不渲染 KnowledgeAdviceCard） |
| `no_match` | 「暂无足够依据」+ 追问（不开外部时） |
| `external_hit` | 上述 + 外部资料卡片 |
| `external_fail` | 「暂无足够依据」+ 追问 |

其他状态由独立字段驱动：`critical`→`safetyWarnings`、`needs_info`→`needsClarification`/产品信息、`out_of_scope`→`outOfScope`。

---

## 6. 状态与测试

### 6.1 后端断言

| 状态 | 断言 |
|---|---|
| 本地 reviewed 命中 + 有安全合格库存 | `knowledge` 非空 + `sources` 含 `local_kb` + `knowledgeStatus=local_hit` |
| 本地命中 + 无通过检查库存 | `knowledgeStatus=local_hit_no_inventory` |
| 仅 provisional 命中 | `knowledgeStatus=insufficient`，无可执行步骤，仅 `pendingKnowledgeNotice` |
| 本地无匹配 + 外部关闭/未授权 | `knowledgeStatus=no_match`，后端固定模板 |
| 外部 Mock 白名单命中 | `externalSources`（title/domain/url/retrieved_at）+ `knowledgeStatus=external_hit` |
| 外部失败/不可靠（Mock） | `knowledgeStatus=external_fail`，LLM 不补全，固定模板 |
| LLM 越权被忽略 | 两次调用产物被后端校验，夹带内容不进入响应 |
| 第二次 LLM 越权 | 调用② 返回未经来源支持的产品名/步骤/比例/时间/危险结论 → 一律忽略 |
| 禁止第二次 LLM 的状态 | `out_of_scope`/`no_match`/`insufficient`/`external_fail` 不调用调用②，固定模板 |
| 超范围前置短路 | 误食/中毒/吸入/身体不适/急救 → 不调用任何 LLM、不检索知识库，直接 `outOfScope=true` 清空各层 |
| 相容性 critical | `safetyWarnings` critical，剥离混用步骤（`sources` 含 `rule`） |
| 知识 warnings | 进入 `safetyWarnings`，`generalAdvice` 为空 |
| 来源去重 | `(type, ref)` 去重 + 固定展示顺序 |

### 6.2 移动端断言

| 状态 | 断言 |
|---|---|
| 各 knowledgeStatus 渲染对应卡片 | 解析新字段 + 分层渲染 |
| 来源卡片不显示长 URL | `SourceLayersCard` 文案断言 |
| 外部 `[打开来源]` 仅 https 白名单 | 跳转校验断言 |
| 网络失败重试 | 保留用户消息，重试不重复 |

### 6.3 落地阶段

- **Stage 2（本设计）**：结果页 + 来源卡片设计。✅
- **Stage 3（后端知识库）**：schema + 首批 reviewed 条目 + `KnowledgeRepository` + `KnowledgeProvider`（本地实现 + 外部 Mock）+ `SafetyScopeClassifier` + 两次 LLM 编排 + 后端测试。
- **Stage 4（移动端 UI）**：`types/assistant.ts` 扩展 + 三新卡片 + 分层渲染 + 测试。
- **Stage 5（联调 QA）**：本地/外部/超范围/追问/critical/网络失败 全链路复现脚本扩展。

---

## 7. 非目标与安全边界（沿用 Stage 1 §7、§9）

- 不把知识库做成百科全书；首期不开启网络搜索；外部内容不写入本地知识库。
- 不生成未经审核的精确稀释比例、接触时间、危险操作参数（除非标签明确）。
- 未知材质/成分/来源不足时追问、降级或拒答；不把"没查到禁忌"说成"绝对安全"。
- 误食/中毒/吸入/身体不适走超范围拒答。
- 所有具体建议必须可追溯到知识条目 / 库存字段 / 相容性规则 / 外部来源。
