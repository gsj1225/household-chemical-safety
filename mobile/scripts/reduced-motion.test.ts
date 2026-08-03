/**
 * 减少动态（Reduced Motion）生产逻辑测试
 *
 * 验证 componentTokens.interaction 在减少动态模式下的行为：
 * - cardPressed 包含 opacity + transform.scale
 * - cardPressedReduced 仅包含 opacity，不包含 transform
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { componentTokens } from '../src/theme/tokens.ts';

describe('Reduced Motion pressed 配方', () => {
  test('cardPressed 包含 opacity 和 transform.scale', () => {
    const pressed = componentTokens.interaction.cardPressed;
    assert.ok('opacity' in pressed, 'cardPressed should have opacity');
    assert.equal(pressed.opacity, 0.88);
    assert.ok('transform' in pressed, 'cardPressed should have transform');
    assert.ok(
      Array.isArray(pressed.transform),
      'transform should be an array',
    );
    const scaleObj = pressed.transform.find(
      (item: Record<string, unknown>) => 'scale' in item,
    );
    assert.ok(scaleObj, 'transform should contain a scale entry');
    assert.equal((scaleObj as { scale: number }).scale, 0.985);
  });

  test('cardPressedReduced 包含 opacity 但不包含 transform', () => {
    const pressedReduced = componentTokens.interaction.cardPressedReduced;
    assert.ok('opacity' in pressedReduced, 'cardPressedReduced should have opacity');
    assert.equal(pressedReduced.opacity, 0.88);
    assert.ok(
      !('transform' in pressedReduced),
      'cardPressedReduced should NOT have transform',
    );
  });

  test('两个配方的 opacity 一致', () => {
    assert.equal(
      componentTokens.interaction.cardPressed.opacity,
      componentTokens.interaction.cardPressedReduced.opacity,
      'Both pressed recipes should have the same opacity',
    );
  });

  test('减少动态配方不产生任何位移或缩放', () => {
    const reduced = componentTokens.interaction.cardPressedReduced;
    const keys = Object.keys(reduced);
    assert.ok(
      !keys.includes('transform'),
      'Reduced recipe must not contain transform',
    );
    assert.ok(
      !keys.includes('scale'),
      'Reduced recipe must not contain top-level scale',
    );
  });
});
