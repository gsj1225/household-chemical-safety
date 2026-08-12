/**
 * 仓库首页顶部操作区响应式布局测试
 *
 * 小屏（320/360/390dp）：标题独占一行，三个操作按钮在下一行均匀排列；
 * 大屏（520dp 及以上）：标题与按钮横向排列。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getHeaderMode, HEADER_COMPACT_THRESHOLD } from '../src/view-models/headerLayout.ts';

describe('仓库首页顶部操作区响应式布局', () => {
  test('320dp 小屏：标题换行（stacked），按钮不再横向挤压', () => {
    assert.equal(getHeaderMode(320), 'stacked');
  });

  test('360dp 小屏：stacked', () => {
    assert.equal(getHeaderMode(360), 'stacked');
  });

  test('390dp 小屏：stacked（约 390dp 真机宽度）', () => {
    assert.equal(getHeaderMode(390), 'stacked');
  });

  test('520dp 大屏：标题与按钮横向排列（row）', () => {
    assert.equal(getHeaderMode(520), 'row');
  });

  test('阈值边界：420 以下 stacked，420 及以上 row', () => {
    assert.equal(getHeaderMode(HEADER_COMPACT_THRESHOLD - 1), 'stacked');
    assert.equal(getHeaderMode(HEADER_COMPACT_THRESHOLD), 'row');
    assert.equal(getHeaderMode(800), 'row');
  });
});
