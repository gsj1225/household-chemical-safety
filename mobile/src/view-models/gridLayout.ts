/**
 * Grid 布局纯函数 — 供组件和测试共用
 */

/** 内容最大宽度 */
export const MAX_CONTENT_WIDTH = 520;

/** 列数 */
export const COLUMN_COUNT = 2;

/** 常规间距（360px 以上） */
export const REGULAR_GAP = 12;

/** 紧凑间距（320–359px） */
export const COMPACT_GAP = 8;

/**
 * 根据容器宽度返回响应式列间距。
 * 320–359px 使用 8px，360px 以上使用 12px。
 */
export function getGap(containerWidth: number): number {
  const clamped = Math.min(containerWidth, MAX_CONTENT_WIDTH);
  return clamped < 360 ? COMPACT_GAP : REGULAR_GAP;
}

/**
 * 根据容器实际宽度计算每张卡片宽度。
 * 返回 0 表示宽度尚未确定（首次渲染前）。
 */
export function calculateCardWidth(containerWidth: number): number {
  if (containerWidth <= 0) return 0;
  const clampedWidth = Math.min(containerWidth, MAX_CONTENT_WIDTH);
  const gap = getGap(clampedWidth);
  return (clampedWidth - gap * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
}

/**
 * 验证给定容器宽度下双列是否可行。
 * 最小单卡宽度 144px（来自视觉规范）。
 */
export function isDualColumnViable(containerWidth: number): boolean {
  const cardWidth = calculateCardWidth(containerWidth);
  return cardWidth >= 144;
}
