/**
 * 封面 URI 加载纯函数测试
 *
 * 覆盖：冷启动首次加载封面、多产品逐项加载、单个 URI 失败不影响其他、
 * 一次调用即完成（不依赖二次导航）、URI 改变后重新加载。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  pruneCoverMap,
  upsertCoverUri,
  loadCoverUris,
  type CoverMap,
} from '../src/view-models/coverLoader.ts';

const p1 = { productId: 'p1' };
const p2 = { productId: 'p2' };
const p3 = { productId: 'p3' };

describe('封面映射纯函数（pruneCoverMap / upsertCoverUri）', () => {
  test('upsertCoverUri：写入新值', () => {
    const r = upsertCoverUri({}, 'p1', 'uri-1');
    assert.equal(r.p1, 'uri-1');
  });

  test('upsertCoverUri：值相同返回原引用（避免无意义重渲染）', () => {
    const prev: CoverMap = { p1: 'uri-1' };
    const r = upsertCoverUri(prev, 'p1', 'uri-1');
    assert.strictEqual(r, prev);
  });

  test('upsertCoverUri：URI 改变时覆盖旧值（触发重新加载）', () => {
    const prev: CoverMap = { p1: 'uri-old' };
    const r = upsertCoverUri(prev, 'p1', 'uri-new');
    assert.equal(r.p1, 'uri-new');
  });

  test('pruneCoverMap：移除已删除产品的残留条目', () => {
    const prev: CoverMap = { p1: 'uri-1', p2: 'uri-2' };
    const r = pruneCoverMap(prev, new Set(['p1']));
    assert.deepEqual(r, { p1: 'uri-1' });
  });
});

describe('封面加载流程（loadCoverUris）', () => {
  test('冷启动首次加载：产品列表返回后逐项成功，立即更新对应卡片', async () => {
    const map: CoverMap = {};
    const updates: CoverMap[] = [];
    await loadCoverUris(
      [p1, p2],
      async (id) => `uri-${id}`,
      (updater) => {
        Object.assign(map, updater(map));
        updates.push({ ...map });
      },
      () => false,
    );
    assert.equal(map.p1, 'uri-p1');
    assert.equal(map.p2, 'uri-p2');
    // 每项完成后即回调，共两次逐项更新（不等全部完成）
    assert.equal(updates.length, 2);
    assert.equal(updates[0].p1, 'uri-p1');
  });

  test('多产品逐项加载：按顺序逐个处理', async () => {
    const order: string[] = [];
    await loadCoverUris(
      [p1, p2, p3],
      async (id) => {
        order.push(id);
        return `uri-${id}`;
      },
      () => {},
      () => false,
    );
    assert.deepEqual(order, ['p1', 'p2', 'p3']);
  });

  test('单个 URI 失败不影响其他产品', async () => {
    const map: CoverMap = {};
    await loadCoverUris(
      [p1, p2, p3],
      async (id) => {
        if (id === 'p2') throw new Error('read failed');
        return `uri-${id}`;
      },
      (updater) => Object.assign(map, updater(map)),
      () => false,
    );
    assert.equal(map.p1, 'uri-p1');
    assert.equal(map.p2, null); // 失败的置 null，不阻塞
    assert.equal(map.p3, 'uri-p3');
  });

  test('一次调用即完成全部封面，不依赖进入详情页后的二次导航', async () => {
    const map: CoverMap = {};
    await loadCoverUris(
      [p1, p2],
      async (id) => `uri-${id}`,
      (updater) => Object.assign(map, updater(map)),
      () => false,
    );
    // 单次 loadCoverUris 即填满全部封面，无需二次导航/再次调用
    assert.equal(map.p1, 'uri-p1');
    assert.equal(map.p2, 'uri-p2');
  });

  test('URI 改变后重新加载：upsert 覆盖旧值', async () => {
    const map: CoverMap = {};
    await loadCoverUris([p1], async () => 'uri-old', (u) => Object.assign(map, u(map)), () => false);
    assert.equal(map.p1, 'uri-old');
    await loadCoverUris([p1], async () => 'uri-new', (u) => Object.assign(map, u(map)), () => false);
    assert.equal(map.p1, 'uri-new');
  });

  test('取消标记置位时停止后续加载', async () => {
    const map: CoverMap = {};
    let cancelled = false;
    let fetched = 0;
    await loadCoverUris(
      [p1, p2, p3],
      async (id) => {
        fetched++;
        if (id === 'p1') cancelled = true; // 第一项后取消
        return `uri-${id}`;
      },
      (updater) => Object.assign(map, updater(map)),
      () => cancelled,
    );
    assert.equal(fetched, 1); // 取消后不再读取其余产品
  });
});
