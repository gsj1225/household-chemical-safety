/**
 * 问答输入区操作栏布局测试
 *
 * 底部「相册 / 拍照 / 发送」应在同一行构成紧凑操作组：
 * - 相邻按钮间距固定 12px；
 * - 不使用 space-between 撑开整行；
 * - 320/360/390/520dp 下均不换行、不超出容器。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSER_ACTION_GAP,
  MAX_ACTION_SPACING,
  getComposerActionLayout,
  composerActionsFit,
} from '../src/view-models/composerLayout.ts';

describe('问答输入区操作栏布局', () => {
  test('相邻按钮间距固定为 12px，且不超过设计上限 16px', () => {
    assert.equal(COMPOSER_ACTION_GAP, 12);
    assert.ok(COMPOSER_ACTION_GAP <= MAX_ACTION_SPACING, 'gap should not exceed design cap');
  });

  test('320/360/390/520dp 下三个按钮同一行容纳，间距不超上限', () => {
    const layout = getComposerActionLayout();
    for (const width of [320, 360, 390, 520]) {
      assert.ok(composerActionsFit(width), `At ${width}dp actions should fit in one row`);
      assert.ok(
        layout.minTotalWidth <= width,
        `At ${width}dp total width ${layout.minTotalWidth} should <= ${width}`,
      );
    }
  });

  test('最小总宽不超过 320dp（最窄屏也不换行、不超出）', () => {
    const layout = getComposerActionLayout();
    assert.ok(layout.minTotalWidth <= 320, `minTotalWidth ${layout.minTotalWidth} <= 320`);
  });

  test('按钮宽度均为正且发送按钮不小于其余按钮', () => {
    const { minWidths } = getComposerActionLayout();
    assert.ok(minWidths[0] > 0 && minWidths[1] > 0 && minWidths[2] > 0);
    assert.ok(minWidths[2] >= minWidths[0], 'send button should be at least as wide');
  });
});
