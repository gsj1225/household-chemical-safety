/**
 * 仓库首页顶部操作区响应式布局纯函数
 *
 * 大屏：标题与「问答/相容性/+ 添加」横向排列；
 * 小屏：标题独占一行，三个操作按钮在下一行均匀排列，避免被挤压/裁切。
 */

export type HeaderMode = 'row' | 'stacked';

/**
 * 小屏阈值：窗口宽度严格小于该值时使用 stacked（标题换行）布局。
 * 390dp 及更窄视为小屏；520dp 及以上为大屏横排。
 */
export const HEADER_COMPACT_THRESHOLD = 420;

/**
 * 根据窗口宽度决定顶部操作区布局模式。
 * @param windowWidth 窗口逻辑宽度（dp）
 */
export function getHeaderMode(windowWidth: number): HeaderMode {
  return windowWidth < HEADER_COMPACT_THRESHOLD ? 'stacked' : 'row';
}
