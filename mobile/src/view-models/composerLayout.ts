/**
 * 问答输入区操作栏布局纯函数
 *
 * 底部「相册 / 拍照 / 发送」应构成同一行紧凑操作组：
 * - 相册-拍照、拍照-发送 均保持固定间距；
 * - 不使用 space-between 撑开整行；
 * - 三个按钮不换行、不超出容器宽度。
 */

/** 相邻按钮间距（dp） */
export const COMPOSER_ACTION_GAP = 12;

/** 相册按钮最小宽度（dp） */
export const ATTACH_BUTTON_MIN_WIDTH = 76;
/** 拍照按钮最小宽度（dp） */
export const CAMERA_BUTTON_MIN_WIDTH = 76;
/** 发送按钮最小宽度（dp，需容纳「发送中…」） */
export const SEND_BUTTON_MIN_WIDTH = 96;

/** 设计上限：任一两按钮间距不得超过该值（dp），用于测试断言 */
export const MAX_ACTION_SPACING = 16;

export interface ComposerActionLayout {
  gap: number;
  minWidths: [number, number, number];
  minTotalWidth: number;
}

/**
 * 返回操作栏三个按钮的布局参数。
 * 按钮实际宽度由内容决定，但最小宽度保证点击区与不换行。
 */
export function getComposerActionLayout(): ComposerActionLayout {
  const minWidths: [number, number, number] = [
    ATTACH_BUTTON_MIN_WIDTH,
    CAMERA_BUTTON_MIN_WIDTH,
    SEND_BUTTON_MIN_WIDTH,
  ];
  const minTotalWidth =
    minWidths.reduce((sum, w) => sum + w, 0) +
    COMPOSER_ACTION_GAP * (minWidths.length - 1);
  return { gap: COMPOSER_ACTION_GAP, minWidths, minTotalWidth };
}

/**
 * 判断给定容器宽度下，三个按钮能否在同一行容纳（不换行、不超出）。
 */
export function composerActionsFit(containerWidth: number): boolean {
  return getComposerActionLayout().minTotalWidth <= containerWidth;
}
