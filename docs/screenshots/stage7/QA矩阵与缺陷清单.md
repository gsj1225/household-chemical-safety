# Stage 7 Visual QA — QA矩阵 + 缺陷清单（v2）

> 生成时间：2026-08-03
> 基线：后端 127/127 通过，移动端 103/103 通过，TypeScript 通过，Expo Web 894KB
> 截图方式：CDP `Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`
> 内容断言：每个场景配置期望文字和禁止文字，等待期望内容出现后才截图
> QA夹具：`?qa=1&scene=<name>&capture=1` 激活（capture模式隐藏调试栏）

## 1. QA矩阵

### 1.1 仓库页面 (InventoryScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 期望文字 | 截图 |
|------|---------|---------|---------|----------|---------|------|
| inventory-empty | PASS | PASS | PASS | PASS | "库存为空" | `inventory-empty-{vp}.jpg` |
| inventory-content | PASS | PASS | PASS | PASS | "共 4 件产品"+"威猛先生" | `inventory-content-{vp}.jpg` |
| inventory-loading | PASS | PASS | PASS | PASS | "加载中" | `inventory-loading-{vp}.jpg` |
| inventory-error | PASS | PASS | PASS | PASS | "无法连接服务" | `inventory-error-{vp}.jpg` |
| inventory-no-results | PASS | PASS | PASS | PASS | "不存在的" | `inventory-no-results-{vp}.jpg` |

### 1.2 入库流程

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 期望文字 | 截图 |
|------|---------|---------|---------|----------|---------|------|
| intake-review-normal | PASS | PASS | PASS | PASS | "核对产品信息"+"威猛先生" | `intake-review-normal-{vp}.jpg` |
| intake-category-unknown | PASS | PASS | PASS | PASS | "核对产品信息"+"识别置信度较低" | `intake-category-unknown-{vp}.jpg` |
| intake-conflict | PASS | PASS | PASS | PASS | "补拍冲突"+"保留原值" | `intake-conflict-{vp}.jpg` |
| intake-permission-denied | PASS | PASS | PASS | PASS | "权限被拒绝"+"前往设置" | `intake-permission-denied-{vp}.jpg` |
| intake-partial-success | PASS | PASS | PASS | PASS | "部分成功"+"照片保存失败"+"重新扫描封面" | `intake-partial-success-{vp}.jpg` |

### 1.3 产品详情 (ProductDetailScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 期望文字 | 截图 |
|------|---------|---------|---------|----------|---------|------|
| detail-full | PASS | PASS | PASS | PASS | "威猛先生"+"次氯酸钠"+"不可混用对象" | `detail-full-{vp}.jpg` |
| detail-minimal | PASS | PASS | PASS | PASS | "未知清洁剂"+"暂无成分信息" | `detail-minimal-{vp}.jpg` |
| detail-long-text | PASS | PASS | PASS | PASS | "超长名称"+"着色剂" | `detail-long-text-{vp}.jpg` + `-bottom.jpg` |
| detail-loading | PASS | PASS | PASS | PASS | "加载中"+"正在获取产品详情" | `detail-loading-{vp}.jpg` |
| detail-error | PASS | PASS | PASS | PASS | "加载失败"+"网络连接失败" | `detail-error-{vp}.jpg` |

### 1.4 编辑与对话框

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 期望文字 | 截图 |
|------|---------|---------|---------|----------|---------|------|
| edit-form | PASS | PASS | PASS | PASS | "编辑产品"+"保存" | `edit-form-{vp}.jpg` + `-bottom.jpg` |
| edit-unsaved-dialog | PASS | PASS | PASS | PASS | "未保存的修改"+"继续编辑" | `edit-unsaved-dialog-{vp}.jpg` |
| detail-delete-dialog | PASS | PASS | PASS | PASS | "确认删除"+"此操作不可撤销" | `detail-delete-dialog-{vp}.jpg` |

### 1.5 相容性页面 (CompatibilityScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 期望文字 | 截图 |
|------|---------|---------|---------|----------|---------|------|
| compat-critical | PASS | PASS | PASS | PASS | "禁止混用"+"含氯消毒剂" | `compat-critical-{vp}.jpg` |
| compat-attention | PASS | PASS | PASS | PASS | "分开存放"+"建议分开存放" | `compat-attention-{vp}.jpg` |
| compat-unknown | PASS | PASS | PASS | PASS | "待补充信息"+"成分信息不完整" | `compat-unknown-{vp}.jpg` |
| compat-empty | PASS | PASS | PASS | PASS | "暂无相容性关系" | `compat-empty-{vp}.jpg` |
| compat-loading | PASS | PASS | PASS | PASS | "加载中" | `compat-loading-{vp}.jpg` |
| compat-error | PASS | PASS | PASS | PASS | "加载相容性数据失败" | `compat-error-{vp}.jpg` |

### 汇总

| 指标 | 数值 |
|------|------|
| 场景总数 | 24 |
| 视口总数 | 4 |
| 截图总数 | 104（96主截图 + 8滚动证据） |
| 内容断言通过 | 104/104 |
| 失败 | 0 |
| 缺陷数 | 0 |

## 2. 内容断言机制

每个场景配置：
- **期望文字**（`expect`）：页面必须包含的全部文字，出现后才截图
- **禁止文字**（`forbid`）：任何一项出现即标记 FAIL
- **通用禁止**（`FORBIDDEN_COMMON`）：`["产品不存在"]`——所有场景禁止
- **超时**：20秒内期望文字未全部出现则 FAIL

JSON 结果来自内容断言，不来自 JPG 是否写入成功。

## 3. 滚动证据

以下场景额外捕获滚动到底部的截图（`-bottom.jpg`后缀），
每张 bottom 截图独立验证目标文字进入视口后才标记 PASS：

| 场景 | 滚动截图 | 目标文字 | 断言 | 结果 |
|------|---------|---------|------|------|
| detail-long-text | 4张（每视口1张） | “删除” | 操作区在视口内可见 | 4/4 PASS |
| edit-form | 4张（每视口1张） | “保存” | 保存按钮在视口内可见 | 4/4 PASS |

JSON 结果包含 104 项（96 主截图 + 8 bottom），每项有独立 status 和 reason。

## 4. QA夹具技术说明

### 4.1 入口切换

- `index.ts` 检测 URL 参数 `?qa=1`，在开发模式下条件加载 `QAApp.tsx`
- `__DEV__` 为 false 时 QA 入口不生效，不影响生产构建
- `capture=1` 参数隐藏 QA 调试栏，截图为真实布局

### 4.2 状态注入

- 直接调用 Zustand `setState` 注入预设状态
- 覆盖 `load`/`refresh`/`loadSummary`/`start`/`startRescan`/`reset` 为空操作
- API 层通过猴补丁返回确定性数据
- 不修改 API 契约、Store 契约或业务流程

### 4.3 生产组件复用

- **部分成功**：使用真实 `IntakeFlowScreen` + Store 注入（step=success, coverSaveFailed=true）
- **权限拒绝**：使用生产 `PermissionDeniedView` 组件（从 IntakePhotoStep 抽取的共享组件）
- **删除确认/未保存退出**：使用生产 `AppDialog` 组件
- 不在 QA 文件中复制生产文案和布局

### 4.4 导航上下文

- `QAFullNavigator` 提供完整6路由导航栈
- 所有使用 `useNavigation()` 的页面均通过导航栈包裹

## 5. 观察项（非缺陷）

| 编号 | 场景 | 视口 | 描述 | 处理 |
|------|------|------|------|------|
| O-001 | inventory-content | 320×568 | 产品卡片底部信息位于首屏以下，需滚动查看 | 小视口预期行为，内容可滚动 |

## 6. 真机验证（待执行）

| 平台 | 状态 | 说明 |
|------|------|------|
| Android | 待执行 | 安全区、键盘、滚动、横竖屏、底部操作、动态字号、减少动态开/关 |
| iOS | **发布前阻塞项** | Windows 环境无法执行 iOS 真机测试 |
