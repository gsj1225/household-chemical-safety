/**
 * 封面 URI 加载纯函数 — 供 InventoryScreen 与测试共用
 *
 * 解决仓库首页冷启动时产品封面不显示的问题：
 * - 产品列表返回后立即逐项加载封面，每个 URI 读取成功就更新对应卡片；
 * - 单个 URI 读取失败不影响其他产品；
 * - 不依赖进入详情页后的二次导航才显示。
 */

export type CoverMap = Record<string, string | null>;

/** 封面 URI 获取函数（注入接口，便于测试与依赖隔离） */
export type CoverUriFetcher = (productId: string) => Promise<string | null>;

/** 仅需 productId 的最小产品形状（生产传 InventoryProduct[]） */
export interface CoverProduct {
  productId: string;
}

/**
 * 纯函数：仅保留仍存在于有效产品集合中的封面映射条目，
 * 用于清理已删除产品残留的旧图片 URI。未变化时返回原引用。
 */
export function pruneCoverMap(prev: CoverMap, validIds: ReadonlySet<string>): CoverMap {
  let changed = false;
  const next: CoverMap = {};
  for (const id of Object.keys(prev)) {
    if (validIds.has(id)) next[id] = prev[id];
    else changed = true;
  }
  return changed ? next : prev;
}

/**
 * 纯函数：写入单条封面 URI。值相同返回原引用（避免无意义重渲染）。
 * URI 改变时以新值覆盖旧值，触发对应卡片重新加载。
 */
export function upsertCoverUri(prev: CoverMap, productId: string, uri: string | null): CoverMap {
  return prev[productId] === uri ? prev : { ...prev, [productId]: uri };
}

/**
 * 逐项加载封面：
 * - 每项读取成功后立即通过 onUpdate 更新对应卡片（不等全部完成）；
 * - 单个 URI 读取失败仅把该项置 null，继续处理其余产品；
 * - 不依赖二次导航，一次调用即可完成全部封面加载；
 * - isCancelled 为 true 时停止后续加载。
 */
export async function loadCoverUris(
  items: readonly CoverProduct[],
  getCoverUri: CoverUriFetcher,
  onUpdate: (updater: (prev: CoverMap) => CoverMap) => void,
  isCancelled: () => boolean,
): Promise<void> {
  for (const p of items) {
    if (isCancelled()) return;
    let uri: string | null = null;
    try {
      uri = await getCoverUri(p.productId);
    } catch {
      uri = null; // 单个失败不阻塞其他产品
    }
    if (isCancelled()) return;
    onUpdate((prev) => upsertCoverUri(prev, p.productId, uri));
  }
}
