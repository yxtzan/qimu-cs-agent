import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeWeight, recommendSize } from './recommend-size';

// Test helper: the result must be a real recommendation, not an out-of-range answer.
function ok(...args: Parameters<typeof recommendSize>) {
  const result = recommendSize(...args);
  if (result.outOfRange) throw new Error(`unexpected out-of-range: ${result.basis}`);
  return result;
}
test('160cm / 50kg → M；158cm / 47kg → S', () => {
  assert.equal(ok(160, 50).size, 'M');
  assert.equal(ok(158, 47).size, 'S');
  assert.equal(ok(160, 50, 'P002').size, 'M');
});
test('斤先换算为公斤，再走同一算法', () => {
  assert.equal(normalizeWeight(100, '斤'), 50);
  assert.equal(ok(160, normalizeWeight(100, '斤')).size, 'M');
  assert.equal(ok(158, normalizeWeight(94, '斤')).size, 'S');
});
test('身高体重分别查表，取较大码；小数区间空隙向上取码', () => {
  assert.equal(ok(158, 55).size, 'L');
  assert.equal(ok(165, 47).size, 'L');
  assert.equal(ok(159.5, 49.5).size, 'M');
});
test('宽松款下半段可小一码，说明保留宽松选择；任一指标超下半段不修正', () => {
  const result = ok(160, 50, 'P013');
  assert.equal(result.size, 'S');
  assert.match(result.basis, /喜欢宽松效果可选 M，想合身选 S/);
  assert.equal(ok(164, 50, 'P013').size, 'M');
  assert.equal(ok(150, 40).size, 'XS');
});
test('修身上沿大一码，下沿不变；XL 上沿无法继续加码', () => {
  assert.equal(ok(163, 52, 'P002').size, 'L');
  assert.equal(ok(160, 53, 'P002').size, 'L');
  assert.equal(ok(160, 50, 'P002').size, 'M');
  const edge = recommendSize(175, 70, 'P002');
  assert.equal(edge.outOfRange, true);
  assert.equal(edge.outOfRange && edge.reason, 'slim_fit');
});
test('表格范围外、非法数字、未知商品不硬推荐', () => {
  for (const [h, w] of [[NaN, 50], [160, Infinity]]) assert.throws(() => recommendSize(h, w));
  assert.throws(() => recommendSize(160, 50, 'P999'), /没有找到/);
});
test('超出尺码表返回结构化结果（不抛错、文案不含「转人工」），带上限和方向', () => {
  for (const [h, w, bound] of [[176, 50, 'max'], [160, 71, 'max'], [185, 90, 'max'], [185, 40, 'max'], [149, 50, 'min'], [160, 39, 'min']] as const) {
    const result = recommendSize(h, w);
    assert.equal(result.outOfRange, true, `${h}/${w}`);
    if (!result.outOfRange || result.reason !== 'chart') throw new Error('expected chart');
    assert.equal(result.bound, bound);
    assert.doesNotMatch(result.basis, /转人工|人工审核|人工确认/);
  }
  const top = recommendSize(185, 90);
  if (!top.outOfRange || top.reason !== 'chart') throw new Error('expected chart');
  assert.deepEqual(top.limit, { size: 'XL', heightCm: 175, weightKg: 70 });
  assert.equal(top.maxSize, 'XL');
});
