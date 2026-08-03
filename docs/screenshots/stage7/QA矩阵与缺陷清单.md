# Stage 7 Visual QA — QA矩阵 + 缺陷清单

> 生成时间：2026-08-03
> 基线：后端 127/127 通过，移动端 103/103 通过，TypeScript 通过，Expo Web 870KB
> 截图方式：CDP `Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`
> QA夹具：`?qa=1&scene=<name>` 激活，不进入正式导航，不修改 API/Store 契约/业务流程

## 1. QA矩阵

### 1.1 仓库页面 (InventoryScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 结果 | 截图 | 缺陷 |
|------|---------|---------|---------|----------|------|------|------|
| inventory-empty | PASS | PASS | PASS | PASS | 空状态正确渲染 | `inventory-empty-{vp}.jpg` | — |
| inventory-content | PASS | PASS | PASS | PASS | 4产品双列布局 | `inventory-content-{vp}.jpg` | D-001 |
| inventory-loading | PASS | PASS | PASS | PASS | 加载状态正确 | `inventory-loading-{vp}.jpg` | — |
| inventory-error | PASS | PASS | PASS | PASS | 错误提示正确 | `inventory-error-{vp}.jpg` | — |
| inventory-no-results | PASS | PASS | PASS | PASS | 无结果提示正确 | `inventory-no-results-{vp}.jpg` | — |

### 1.2 入库流程 (IntakeReviewStep / 独立组件)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 结果 | 截图 | 缺陷 |
|------|---------|---------|---------|----------|------|------|------|
| intake-review-normal | PASS | PASS | PASS | PASS | 核对表单完整 | `intake-review-normal-{vp}.jpg` | — |
| intake-category-unknown | PASS | PASS | PASS | PASS | 品类未选择高亮 | `intake-category-unknown-{vp}.jpg` | — |
| intake-conflict | PASS | PASS | PASS | PASS | 冲突卡片正确 | `intake-conflict-{vp}.jpg` | — |
| intake-permission-denied | PASS | PASS | PASS | PASS | 权限拒绝提示 | `intake-permission-denied-{vp}.jpg` | D-002 |
| intake-partial-success | PASS | PASS | PASS | PASS | 部分成功提示 | `intake-partial-success-{vp}.jpg` | — |

### 1.3 产品详情 (ProductDetailScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 结果 | 截图 | 缺陷 |
|------|---------|---------|---------|----------|------|------|------|
| detail-full | PASS | PASS | PASS | PASS | 完整字段展示 | `detail-full-{vp}.jpg` | — |
| detail-minimal | PASS | PASS | PASS | PASS | 缺字段正确渲染 | `detail-minimal-{vp}.jpg` | — |
| detail-long-text | PASS | PASS | PASS | PASS | 长文本不溢出 | `detail-long-text-{vp}.jpg` | — |
| detail-loading | PASS | PASS | PASS | PASS | 加载状态正确 | `detail-loading-{vp}.jpg` | — |
| detail-error | PASS | PASS | PASS | PASS | 错误提示正确 | `detail-error-{vp}.jpg` | — |

### 1.4 编辑与对话框 (ProductEditScreen / AppDialog)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 结果 | 截图 | 缺陷 |
|------|---------|---------|---------|----------|------|------|------|
| edit-form | PASS | PASS | PASS | PASS | 编辑表单完整 | `edit-form-{vp}.jpg` | — |
| edit-unsaved-dialog | PASS | PASS | PASS | PASS | 未保存退出对话框 | `edit-unsaved-dialog-{vp}.jpg` | — |
| detail-delete-dialog | PASS | PASS | PASS | PASS | 删除确认对话框 | `detail-delete-dialog-{vp}.jpg` | — |

### 1.5 相容性页面 (CompatibilityScreen)

| 场景 | 320×568 | 390×844 | 520×844 | 1280×900 | 结果 | 截图 | 缺陷 |
|------|---------|---------|---------|----------|------|------|------|
| compat-critical | PASS | PASS | PASS | PASS | 严重冲突关系卡 | `compat-critical-{vp}.jpg` | — |
| compat-attention | PASS | PASS | PASS | PASS | 注意级关系卡 | `compat-attention-{vp}.jpg` | — |
| compat-unknown | PASS | PASS | PASS | PASS | 未知级关系卡 | `compat-unknown-{vp}.jpg` | — |
| compat-empty | PASS | PASS | PASS | PASS | 空状态正确 | `compat-empty-{vp}.jpg` | — |
| compat-loading | PASS | PASS | PASS | PASS | 加载状态正确 | `compat-loading-{vp}.jpg` | — |
| compat-error | PASS | PASS | PASS | PASS | 错误提示正确 | `compat-error-{vp}.jpg` | — |

### 汇总

| 指标 | 数值 |
|------|------|
| 场景总数 | 24 |
| 视口总数 | 4 |
| 截图总数 | 96 |
| 通过 | 96 |
| 失败 | 0 |
| 缺陷数 | 2（均 P3） |

## 2. 缺陷清单

| 编号 | 等级 | 场景 | 视口 | 描述 | 根因 | 建议处理 |
|------|------|------|------|------|------|---------|
| D-001 | P3 | inventory-content | 320×568 | 产品卡片底部信息（有效期、储存要求）被截断，需下滑才能看到完整内容 | 320×568 视口高度有限，双列卡片+摘要栏占用空间超出首屏 | 小视口预期行为，内容可滚动查看，无需修复 |
| D-002 | P3 | intake-permission-denied | 全部 | Web 环境无法真正触发 expo-image-picker 的相机权限拒绝，QA 夹具渲染了与权限拒绝时相同的 StateMessage 组件，但非真实权限流程触发 | expo-image-picker 在 Web 平台不请求原生权限 | Web 平台限制，真机验证时需在 Android/iOS 上测试真实权限拒绝流程 |

## 3. 视口覆盖说明

| 视口 | 设备模拟 | mobile 标志 | 用途 |
|------|---------|-------------|------|
| 320×568 | iPhone SE (1st gen) | true | 最小目标设备，验证小屏布局 |
| 390×844 | iPhone 14 | true | 标准移动端视口 |
| 520×844 | — | true | 大屏手机/小平板，验证中间断点 |
| 1280×900 | — | false | 桌面 Web，验证宽屏布局 |

## 4. 场景覆盖说明

### 4.1 仓库 (5场景)

| 状态 | 场景 | 渲染方式 |
|------|------|---------|
| 空 | inventory-empty | Store 注入空 items + success |
| 有数据 | inventory-content | Store 注入 4 个产品 + has_conflict 摘要 |
| 加载中 | inventory-loading | Store 注入 loading 状态 |
| 错误 | inventory-error | Store 注入 error + errorMessage |
| 无搜索结果 | inventory-no-results | Store 注入空 items + searchQuery + success |

### 4.2 入库 (5场景)

| 状态 | 场景 | 渲染方式 |
|------|------|---------|
| 正常核对 | intake-review-normal | Store 注入 review step + draft + reviewForm(category=kitchen_cleaner) |
| 品类未知 | intake-category-unknown | Store 注入 review step + reviewForm(category=null) |
| 补拍冲突 | intake-conflict | Store 注入 review step + 2个 formConflicts (1未解决/1已解决) |
| 权限拒绝 | intake-permission-denied | 独立组件渲染 StateMessage(error tone) + "前往设置"按钮 |
| 部分成功 | intake-partial-success | 独立组件渲染 StateMessage(error tone) + "完成"按钮 |

### 4.3 详情 (5场景)

| 状态 | 场景 | 渲染方式 |
|------|------|---------|
| 完整字段 | detail-full | API mock 返回完整产品 |
| 缺字段 | detail-minimal | API mock 返回最简产品(无品牌/日期/成分) |
| 长文本 | detail-long-text | API mock 返回超长名称/多成分/多危险说明 |
| 加载中 | detail-loading | API mock 返回永不 resolve 的 Promise |
| 加载失败 | detail-error | API mock 抛出错误 |

### 4.4 编辑与对话框 (3场景)

| 状态 | 场景 | 渲染方式 |
|------|------|---------|
| 编辑表单 | edit-form | API mock getById 返回产品，渲染编辑界面 |
| 未保存退出 | edit-unsaved-dialog | 独立组件渲染 AppDialog(unsaved variant) |
| 删除确认 | detail-delete-dialog | 独立组件渲染 AppDialog(destructive variant) |

### 4.5 相容性 (6场景)

| 状态 | 场景 | 渲染方式 |
|------|------|---------|
| 严重冲突 | compat-critical | Store 注入 critical 关系 + has_conflict 摘要 |
| 注意级 | compat-attention | Store 注入 attention 关系 + has_conflict 摘要 |
| 未知级 | compat-unknown | Store 注入 unknown 关系 + needs_information 摘要 |
| 空状态 | compat-empty | Store 注入空 relations + success |
| 加载中 | compat-loading | Store 注入 loading 状态 |
| 错误 | compat-error | Store 注入 error + errorMessage |

## 5. QA夹具技术说明

### 5.1 入口切换

- `index.ts` 检测 URL 参数 `?qa=1`，在开发模式下条件加载 `QAApp.tsx` 替代正式 `App.tsx`
- 生产构建不受影响（`__DEV__` 为 false 时 QA 入口不生效）
- QA 夹具不进入正式导航

### 5.2 状态注入

- 直接调用 Zustand store 的 `setState` 注入预设状态
- 覆盖 `load`/`refresh`/`loadSummary` 为空操作，防止组件 `useEffect` 自动加载覆盖注入状态
- API 层通过猴补丁 `inventoryApi.getDetail`/`getById` 和 `photoAssetService.getCoverUri` 返回确定性数据
- 不修改 API 契约、Store 契约或业务流程

### 5.3 导航上下文

- 使用 `QAFullNavigator`（完整导航栈）包裹需要 `useNavigation()` 的页面
- 包含所有 6 个路由：Inventory / IntakeFlow / ProductDetail / ProductEdit / Compatibility / RelationDetail
- 对话框场景（delete/unsaved）使用独立组件渲染，不需要导航上下文

## 6. 真机验证（待执行）

| 平台 | 状态 | 说明 |
|------|------|------|
| Android | 待执行 | 优先验证：安全区、键盘弹出、滚动、横竖屏、底部操作、动态字号、减少动态开/关 |
| iOS | **发布前阻塞项** | 当前 Windows 环境无法执行 iOS 真机测试，发布前必须在 macOS + Xcode 环境完成 |

### 真机验证检查清单

- [ ] 安全区（刘海/底部 Home 指示条不遮挡内容）
- [ ] 键盘弹出时输入框不被遮挡
- [ ] 长列表滚动流畅
- [ ] 横屏布局不破版
- [ ] 底部操作按钮可达
- [ ] 系统动态字号放大后布局不溢出
- [ ] 系统减少动态开启：Pressable 无 scale 动画，Dialog 无 fade 动画
- [ ] 系统减少动态关闭：Pressable 有 scale 动画，Dialog 有 fade 动画
- [ ] 焦点切换时 VoiceOver/TalkBack 正确朗读状态变化
