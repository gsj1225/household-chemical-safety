# 排雷挑战 - 后端服务

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 复制环境变量配置
cp .env.example .env

# 启动开发服务器
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 自动化测试

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

## API 文档

启动后访问 http://localhost:8000/docs 查看交互式 API 文档。

### 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/challenge/start | 开始一次排雷挑战 |
| POST | /api/scan/panorama | 全景扫描，返回需细拍区域 |
| POST | /api/scan/identify | 细拍识别，返回待用户核对的产品草稿 |
| POST | /api/scan/confirm | 确认/修正产品后执行本地风险评估 |
| POST | /api/narration/generate | 生成识别等待期间的趣味旁白 |
| POST | /api/challenge/result | 获取排雷报告 |
| GET | /api/challenge/history | 查询最近挑战摘要 |

## 数据持久化

挑战状态默认保存到 `backend/data/challenges.db`。可通过 `DATABASE_PATH` 修改位置。Docker 部署时应把数据库目录挂载为持久化卷；多实例生产部署建议将 `ChallengeRepository` 替换为 PostgreSQL 实现。

## 错误与请求追踪

每个响应包含 `X-Request-ID`。错误响应统一为：

```json
{
  "error": {
    "code": "CHALLENGE_NOT_FOUND",
    "message": "挑战不存在",
    "request_id": "0123456789abcdef"
  }
}
```

访问日志只记录请求方法、路径、状态码、耗时和 requestId，不记录图片、请求体或 API Key。

## 隐私与限流

- 原始图片仅在当前请求内以内存处理，不写入数据库、磁盘或日志。
- 每个 challenge 最多细拍 20 次。
- 开始挑战、扫描、旁白和报告接口按客户端执行进程内限流。
- 进程内限流只适合单实例 Demo；多实例部署需迁移到 API Gateway 或 Redis。
- `DEBUG=false` 时必须配置明确的 `CORS_ORIGINS`，不能使用通配符。

## AI 接口切换

项目已实现 Mock 与 Qwen 两种 Provider。真实识别配置仅放在后端 `.env`：

```bash
AI_PROVIDER=qwen
QWEN_API_KEY=<local-secret>
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_VL_MODEL=qwen3-vl-plus
QWEN_TEXT_MODEL=qwen-flash
```

Qwen3-VL 只负责全景观察和包装/OCR；风险结论与报告评分由本地规则引擎确定。切换到 Qwen 后不会静默回退到 Mock 数据。

## 数据文件

| 文件 | 说明 | 当前数量 |
|---|---|---|
| risk_rules.json | 化学品冲突规则库 | 15条 |
| category_risks.json | 品类通用风险模板 | 20条 |
| product_risks.json | 已知风险产品库 | 8条 |
| narration_templates.json | 趣味旁白模板 | 4类 |
| risk_evidence.json | 风险来源、证据等级与审核状态 | 15条规则+8条产品 |

风险结果中的 `verified` 表示已登记权威资料来源，`needs_review` 表示内容仍需专业复核。品类识别和规则命中不等于实验室检出或产品超标。

## 项目结构

```
app/
├── api/routes/     API 路由层
├── core/           AI接口抽象 + 风险引擎
├── models/         Pydantic 数据模型
├── data/           静态数据文件 (JSON)
├── utils/          工具函数
├── config.py       配置管理
└── main.py         应用入口
```
