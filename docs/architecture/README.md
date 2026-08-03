# 家庭化学品库——架构图集

> 版本：v2.0（待确认）
>
> 本页用于快速理解目标边界；字段、错误码、迁移和验收以 [完整架构方案](./架构方案.md) 为准。

## 1. 系统上下文

```mermaid
flowchart LR
    U["家庭用户"]
    APP["Expo 应用\n我的化学品库"]
    PHOTO["设备本地\n压缩封面缩略图"]
    API["FastAPI\n库存与识别 API"]
    AI["Qwen / Mock\n观察与 OCR"]
    ENGINE["相容性规则引擎\n确定性判断"]
    DB[("SQLite\n产品与关系")]

    U --> APP
    APP -->|"用户确认后保存"| PHOTO
    APP -->|"JSON / 临时识别图"| API
    API --> AI
    AI -->|"待确认草稿"| API
    API --> ENGINE
    API --> DB
    ENGINE --> DB
    API --> APP
```

核心边界：

- AI 回答“包装上可能写了什么”，不直接回答“是否安全”。
- 用户确认后的结构化事实才写入库存和相容性计算。
- 封面照片保存在设备本地，后端不保存本地 URI 或全尺寸家庭照片。
- 关系提示表示规则条件可能成立，不表示产品正在共同存放或混用。

## 2. 扫描入库数据流

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant M as 移动端
    participant P as 本地封面存储
    participant A as FastAPI
    participant V as 视觉模型
    participant D as SQLite
    participant R as 相容性规则

    U->>M: 拍照或从相册选择
    M->>A: POST /inventory/recognitions（临时图片）
    A->>V: 视觉观察与 OCR
    V-->>A: 字段候选与置信度
    A-->>M: RecognitionDraft + 疑似重复候选
    U->>M: 核对、补充、选择封面
    M->>P: 生成暂存缩略图
    M->>A: POST/PATCH 产品 JSON
    A->>D: 事务写入产品
    A->>R: 与受影响库存比较
    R->>D: 写入相容性关系
    A-->>M: 产品 + 关系摘要
    M->>P: 暂存图提升为 productId 封面
    M-->>U: 入库成功与新增提醒
```

失败恢复：识别失败保留临时照片；保存失败保留表单与 operationId；本地封面提升失败显示可恢复占位，不删除结构化产品。

## 3. 后端分层

```mermaid
flowchart TB
    ROUTES["Inventory / Recognition / Compatibility Routes"]
    SERVICES["InventoryService · RecognitionService · CompatibilityService"]
    REPO["InventoryRepository"]
    DUP["DuplicateMatcher"]
    ENGINE["CompatibilityEngine"]
    PROVIDER["AIProvider"]
    RULES["版本化规则、别名与证据"]
    DB[("SQLite")]

    ROUTES --> SERVICES
    SERVICES --> REPO
    SERVICES --> DUP
    SERVICES --> ENGINE
    SERVICES --> PROVIDER
    ENGINE --> RULES
    REPO --> DB
    ENGINE --> DB
```

- Route 只负责 HTTP、校验和稳定错误码。
- Service 编排事务、重复决策、revision 和 operationId。
- Repository 不调用模型和规则。
- Engine 只接收已确认事实，不读取图片。

## 4. 移动端组件与状态

```mermaid
flowchart TB
    NAV["App / Navigation"]
    SCREENS["Inventory · Intake · Product Detail/Edit · Compatibility"]
    VIEWS["Feature Views"]
    COMPOSITES["ProductGrid · ProductCard · ProductPairCard · ProductForm"]
    PRIMITIVES["AppText · AppButton · AppDialog · SemanticBadge"]
    TOKENS["Raw → Semantic → Component Tokens"]
    INV["inventoryStore\n服务端实体缓存"]
    DRAFT["intakeStore\n短期照片与草稿"]
    API["Inventory API"]
    PHOTO["PhotoAssetService"]

    NAV --> SCREENS --> VIEWS --> COMPOSITES --> PRIMITIVES --> TOKENS
    SCREENS --> INV --> API
    SCREENS --> DRAFT --> API
    DRAFT --> PHOTO
```

状态所有权：

- `inventoryStore`：产品、关系、摘要、筛选和请求状态。
- `intakeStore`：单次入库步骤、operationId、临时照片、草稿和失败恢复。
- 页面本地：表单 dirty、对话框、字段错误、搜索输入和证据展开。
- 组件：只接收 ViewModel 和语义事件，不读取 Store/API。

完整组件图：

[![家庭化学品库前端组件图](../../design/component-map/inventory-component-map.png)](../design/前端组件图与设计令牌映射.md)

## 5. 数据所有权

| 数据 | 移动端会话 | 设备封面存储 | SQLite | 模型服务 |
|---|---:|---:|---:|---:|
| 相机/相册临时图 | 是 | 否 | 否 | 否 |
| 识别上传压缩图 | 请求期 | 否 | 否 | Qwen 模式短期发送 |
| 用户选择的封面缩略图 | 解析引用 | 是 | 否 | 否 |
| 识别草稿 | 是 | 否 | 否 | 产生后返回 |
| 用户确认产品 | 缓存 | 否 | 是 | 否 |
| 相容性关系与证据 | 缓存 | 否 | 是 | 否 |
| operationId | 入库/编辑会话 | 否 | 幂等记录 | 否 |

## 6. 相容性计算

```mermaid
flowchart LR
    CHANGE["新增 / 修改 / 删除产品"]
    FACTS["读取用户确认事实"]
    NORMALIZE["成分与类别别名归一化"]
    MATCH["版本化规则双向匹配"]
    REL["冲突 / 分开储存 / 使用间隔 / 待补充"]
    SUMMARY["仓库与单品摘要"]

    CHANGE --> FACTS --> NORMALIZE --> MATCH --> REL --> SUMMARY
```

- 新增和修改只与受影响产品比较；删除级联移除相关关系。
- 无命中不创建 `safe` 记录，展示“当前规则库未发现已登记禁忌”。
- 每条命中保存规则 ID、版本、说明、动作、证据状态和来源。

## 7. 迁移顺序

1. 锁定 DTO、错误码和规则枚举。
2. 建立令牌兼容层与无障碍 Primitive。
3. 新增 Inventory 表/API 与相容性引擎；旧 challenge 能力保留。
4. 完成只读双列仓库代表性切片。
5. 接入真实查询，再实现扫描入库和本地封面。
6. 实现重复、补拍、详情、编辑、删除和相容性界面。
7. 完成 24 状态和 Android/iOS/Web QA。
8. 产品确认后单独清理旧 challenge、报告和传播代码。

具体 Agent 任务包见 [家庭化学品库实施计划](../implementation/家庭化学品库实施计划.md)。

## 8. 配套资料

- [产品方案](../product/家庭化学品安全方案.md)
- [用户流程](../product/用户流程.md)
- [低保真线框图](../design/手机端页面线框图.md)
- [视觉基础](../design/移动端视觉规范.md)
- [组件图与令牌映射](../design/前端组件图与设计令牌映射.md)
- [完整架构方案](./架构方案.md)
- [功能实施计划](../implementation/家庭化学品库实施计划.md)
