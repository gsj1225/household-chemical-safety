/**
 * 双列布局纯函数测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCardWidth,
  isDualColumnViable,
  getGap,
  MAX_CONTENT_WIDTH,
  COLUMN_COUNT,
  REGULAR_GAP,
  COMPACT_GAP,
} from '../src/view-models/gridLayout.ts';

describe('ProductGrid 双列布局', () => {
  test('390px 宽度下双列可行且卡片宽度正确（12px 间距）', () => {
    const width = 390;
    const gap = getGap(width);
    assert.equal(gap, REGULAR_GAP, '390px should use regular gap (12px)');
    const cardWidth = calculateCardWidth(width);
    // 390 - 12 = 378, 378 / 2 = 189
    assert.equal(cardWidth, 189);
    assert.ok(isDualColumnViable(width), '390px should support dual columns');
    // 两张卡片 + 间距应恰好等于容器宽度
    const totalWidth = cardWidth * COLUMN_COUNT + gap;
    assert.equal(totalWidth, width);
  });

  test('430px 宽度下双列可行且卡片宽度正确（12px 间距）', () => {
    const width = 430;
    const gap = getGap(width);
    assert.equal(gap, REGULAR_GAP, '430px should use regular gap (12px)');
    const cardWidth = calculateCardWidth(width);
    // 430 - 12 = 418, 418 / 2 = 209
    assert.equal(cardWidth, 209);
    assert.ok(isDualColumnViable(width), '430px should support dual columns');
    const totalWidth = cardWidth * COLUMN_COUNT + gap;
    assert.equal(totalWidth, width);
  });

  test('520px 宽度下双列可行且不超出最大宽度', () => {
    const width = 520;
    const gap = getGap(width);
    assert.equal(gap, REGULAR_GAP, '520px should use regular gap (12px)');
    const cardWidth = calculateCardWidth(width);
    // 520 - 12 = 508, 508 / 2 = 254
    assert.equal(cardWidth, 254);
    assert.ok(isDualColumnViable(width), '520px should support dual columns');
  });

  test('超过 520px 时卡片宽度不超过 520px 对应值', () => {
    const wideWidth = 800;
    const cardWidth = calculateCardWidth(wideWidth);
    const maxWidth = calculateCardWidth(MAX_CONTENT_WIDTH);
    assert.equal(cardWidth, maxWidth, 'Should clamp to max content width');
  });

  test('宽度为 0 时返回 0（首次渲染前）', () => {
    assert.equal(calculateCardWidth(0), 0);
    assert.equal(calculateCardWidth(-1), 0);
  });

  test('320px 最窄宽度下使用 8px 紧凑间距且双列仍可行', () => {
    const width = 320;
    const gap = getGap(width);
    assert.equal(gap, COMPACT_GAP, '320px should use compact gap (8px)');
    const cardWidth = calculateCardWidth(width);
    // 320 - 8 = 312, 312 / 2 = 156
    assert.equal(cardWidth, 156);
    assert.ok(cardWidth >= 144, 'Card width should be at least 144px at 320px');
    assert.ok(isDualColumnViable(width), '320px should still support dual columns');
    const totalWidth = cardWidth * COLUMN_COUNT + gap;
    assert.equal(totalWidth, width);
  });

  test('350px 宽度下仍使用 8px 紧凑间距', () => {
    const width = 350;
    const gap = getGap(width);
    assert.equal(gap, COMPACT_GAP, '350px should use compact gap (8px)');
    const cardWidth = calculateCardWidth(width);
    // 350 - 8 = 342, 342 / 2 = 171
    assert.equal(cardWidth, 171);
    assert.ok(isDualColumnViable(width), '350px should support dual columns');
  });

  test('360px 宽度切换到 12px 常规间距', () => {
    const width = 360;
    const gap = getGap(width);
    assert.equal(gap, REGULAR_GAP, '360px should use regular gap (12px)');
    const cardWidth = calculateCardWidth(width);
    // 360 - 12 = 348, 348 / 2 = 174
    assert.equal(cardWidth, 174);
  });

  test('两张卡片总宽度不超过容器宽度', () => {
    for (const width of [320, 350, 360, 390, 430, 520, 800]) {
      const cardWidth = calculateCardWidth(width);
      if (cardWidth === 0) continue;
      const gap = getGap(width);
      const totalWidth = cardWidth * COLUMN_COUNT + gap;
      const clampedContainer = Math.min(width, MAX_CONTENT_WIDTH);
      assert.ok(
        totalWidth <= clampedContainer + 0.01,
        `At ${width}px: total ${totalWidth} should not exceed container ${clampedContainer}`,
      );
    }
  });
});
