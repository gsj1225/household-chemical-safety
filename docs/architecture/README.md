# 架构图集

> 本页用于快速理解项目边界、数据流和组件职责。详细约束、决策记录与迁移顺序以同目录的 [架构方案](./架构方案.md) 为准。

## 1. 系统上下文

```mermaid
flowchart LR
    User["家庭用户<br/>拍照、核对、查看建议"]
    App["Expo / React Native 应用<br/>Android · iOS · Web"]
    API["FastAPI 服务<br/>流程编排与错误契约"]
    Vision["Qwen3-VL 或 Mock Provider<br/>只负责视觉观察与 OCR"]
    Rules["本地风险规则引擎<br/>确定性判断与评分"]
    DB[("SQLite<br/>挑战、结构化结果、报告")]

    User -->|"拍摄或选择照片"| App
    App -->|"HTTPS / JSON / Multipart"| API
    API -->|"全景观察、包装识别"| Vision
    Vision -->|"结构化候选信息"| API
    API -->|"已确认产品信息"| Rules
    Rules -->|"风险事实、建议、扣分"| API
    API --> DB
    API -->|"区域、草稿、报告"| App

    classDef person fill:#fff,stroke:#111,stroke-width:2px;
    classDef system fill:#f4f4f4,stroke:#111,stroke-width:1.5px;
    classDef external fill:#fff,stroke:#777,stroke-dasharray:5 4;
    class User person;
    class App,API,Rules,DB system;
    class Vision external;
```

核心边界：

- 模型负责回答“画面里可能有什么”，不能直接裁决安全结论。
- 用户必须核对或修正产品信息，确认后才进入风险规则。
- 风险事实、处置建议和分数由本地规则引擎确定，结果可测试、可追溯。
- 原始图片只存在于当前请求和页面会话中，不写入 SQLite、日志或长期缓存。

## 2. 单场景检查数据流

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant M as 移动端
    participant A as FastAPI
    participant V as 视觉模型
    participant R as 风险规则
    participant D as SQLite

    U->>M: 拍摄或选择一张场景全景图
    M->>A: POST /scan/panorama
    A->>V: 全景观察与区域建议
    V-->>A: 场景标签 + 1～3 个细拍区域
    A-->>M: 原图归一化坐标与引导文案
    M-->>U: 在原图圈出下一处细拍位置

    loop 每个建议区域
        U->>M: 拍摄或选择近景图
        M->>A: POST /scan/identify
        A->>V: 包装识别与 OCR
        V-->>A: 待确认产品草稿
        A-->>M: 产品名、品类、成分与置信度
        U->>M: 核对或修正
        M->>A: POST /scan/confirm
        A->>R: 使用已确认信息匹配规则
        R-->>A: 风险事实、建议与证据
        A->>D: 保存结构化确认结果
        A-->>M: 单品检查结果
    end

    M->>A: POST /challenge/result
    A->>R: 汇总当前场景并评分
    A->>D: 保存场景报告
    A-->>M: 分数、雷点和证据状态
    M-->>U: 展示单场景检查报告
```

为什么改成单场景：

- 一次只检查厨房、储物柜等一个场景，避免强制用户连续拍摄多个房间。
- 每张全景图只产生 1～3 个最有信息价值的细拍区域，缩短完成路径。
- 报告只描述本张全景图覆盖的范围，不暗示整套住宅已经完成检查。

## 3. 后端分层与信任边界

```mermaid
flowchart TB
    subgraph Transport["接口与传输层"]
        Routes["API Routes<br/>参数、Multipart、HTTP 状态"]
        Envelope["统一错误信封<br/>code · message · request_id"]
    end

    subgraph Application["应用服务层"]
        Challenge["ChallengeService<br/>生命周期"]
        Scan["ScanService<br/>全景、草稿、确认"]
        Report["ReportService<br/>证据门槛与报告"]
        Narration["NarrationService<br/>非安全结论旁白"]
    end

    subgraph Domain["领域与基础设施"]
        Provider["AIProvider 接口"]
        Qwen["Qwen Provider"]
        Mock["Mock Provider"]
        Engine["RiskEngine"]
        RuleData["JSON 风险与证据库"]
        Repo["SQLite Repository"]
    end

    Routes --> Challenge
    Routes --> Scan
    Routes --> Report
    Routes --> Narration
    Routes --> Envelope
    Scan --> Provider
    Provider --> Qwen
    Provider --> Mock
    Scan --> Engine
    Report --> Engine
    Engine --> RuleData
    Challenge --> Repo
    Scan --> Repo
    Report --> Repo
```

禁止跨越的边界：

- API 路由不直接拼装风险结论。
- AI Provider 不读写 SQLite，也不计算最终分数。
- 风险规则不依赖模型自由文本，只接收已确认的结构化字段。
- Repository 不保存原始照片。

## 4. 移动端组件边界

```mermaid
flowchart TB
    App["App / Navigation"]

    subgraph Screens["页面控制器"]
        Home["HomeScreen"]
        Scan["ScanScreen<br/>扫描状态机与请求编排"]
        Result["ResultScreen"]
        History["HistoryScreen"]
    end

    subgraph Views["功能视图"]
        Panorama["PanoramaInputView"]
        Analysis["AnalysisView"]
        Area["AreaGuideView"]
        Review["IdentificationReviewView"]
        Single["ResultView"]
        Empty["EvidenceInsufficientView"]
        Recovery["PanoramaRecoveryView"]
    end

    subgraph Components["共享组合组件"]
        Photo["PhotoFrame / PhotoInputActions"]
        Progress["ProgressSummary"]
        Risk["RiskCard / ChemicalProfileCard"]
        RecoverPanel["RecoveryPanel"]
    end

    subgraph Primitives["基础组件与令牌"]
        Primitive["AppText · AppButton · Surface<br/>TextField · StatusBadge · StateMessage"]
        Tokens["Raw → Semantic → Component Tokens"]
    end

    App --> Screens
    Home --> Components
    Scan --> Views
    Result --> Components
    History --> Components
    Views --> Components
    Components --> Primitive
    Primitive --> Tokens
```

职责规则：

- Screen 负责 API、Zustand、导航和请求互斥。
- View 只接收数据与 typed callbacks，不直接调用 API 或导航。
- Composite 组合业务语义，但不拥有页面状态机。
- Primitive 只表达通用交互；颜色、间距、字号和边框从令牌读取。

完整组件图：

[![前端组件图与令牌映射](../../design/component-map/frontend-component-map.png)](../design/前端组件图与设计令牌映射.md)

## 5. 异常恢复架构

> 当前已落地首页创建失败和全景分析失败代表性切片；细拍、确认和报告恢复暂缓，后续沿同一边界迁移。

```mermaid
flowchart LR
    ApiError["ApiError<br/>status · code · requestId · retryAfter"]
    Normalize["toAppFailure()<br/>归一化失败事实"]
    Failure["AppFailure<br/>network · timeout · invalid_photo<br/>expired · service"]
    Copy["getRecoveryCopy()<br/>按操作生成用户文案"]
    Controller["Screen Controller<br/>保留请求上下文与照片 URI"]
    Panel["RecoveryPanel<br/>语义、动作层级、可访问性"]
    Retry["重试同一请求"]
    Replace["重拍或从相册换图"]
    Restart["失效时重新开始"]

    ApiError --> Normalize --> Failure --> Copy --> Controller --> Panel
    Panel --> Retry
    Panel --> Replace
    Panel --> Restart
```

恢复原则：

- 可重试错误留在当前页面，不用系统弹窗覆盖任务。
- 网络或超时优先复用原 challenge 和原照片。
- 图片无效时优先重拍或换图，不能把所有错误都包装成“网络问题”。
- 错误对象、失败照片 URI 和重试闭包不写入全局 store。
- 用户消息不出现 API 地址、端口、堆栈、密钥或完整内部异常。

## 6. 数据所有权与隐私

| 数据 | 页面内存 | Zustand | SQLite | 模型服务 |
|---|---:|---:|---:|---:|
| 原始全景/近景照片 | 是，短期 | 否 | 否 | Qwen 模式会发送 |
| challenge ID | 是 | 是 | 是 | 否 |
| 场景标签与区域坐标 | 是 | 是 | 是 | 由视觉模型产生 |
| 待确认识别草稿 | 是 | 是，当前流程 | 临时状态 | 由视觉模型产生 |
| 用户确认产品信息 | 是 | 是 | 是 | 否 |
| 风险事实、证据与评分 | 是 | 是 | 是 | 否 |
| 恢复错误与失败照片 URI | 是，短期 | 否 | 否 | 否 |

## 7. 配套设计资料

- [用户流程](../product/用户流程.md)
- [手机端低保真线框图](../design/手机端页面线框图.md)
- [移动端视觉规范](../design/移动端视觉规范.md)
- [前端组件图与设计令牌映射](../design/前端组件图与设计令牌映射.md)
- [异常恢复用户流程](../product/异常恢复用户流程.md)
- [异常恢复低保真线框图](../design/异常恢复页面线框图.md)
