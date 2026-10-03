import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeWeight, recommendSize } from './recommend-size';

test('160cm / 50kg → M；158cm / 47kg → S', () => {
  assert.equal(recommendSize(160, 50).size, 'M');
  assert.equal(recommendSize(158, 47).size, 'S');
  assert.equal(recommendSize(160, 50, 'P002').size, 'M');
});
test('斤先换算为公斤，再走同一算法', () => {
  assert.equal(normalizeWeight(100, '斤'), 50);
  assert.equal(recommendSize(160, normalizeWeight(100, '斤')).size, 'M');
  assert.equal(recommendSize(158, normalizeWeight(94, '斤')).size, 'S');
});
test('身高体重分别查表，取较大码；小数区间空隙向上取码', () => {
  assert.equal(recommendSize(158, 55).size, 'L');
  assert.equal(recommendSize(165, 47).size, 'L');
  assert.equal(recommendSize(159.5, 49.5).size, 'M');
});
test('宽松款下半段可小一码，说明保留宽松选择；任一指标超下半段不修正', () => {
  const result = recommendSize(160, 50, 'P013');
  assert.equal(result.size, 'S');
  assert.match(result.basis, /喜欢宽松效果可选 M，想合身选 S/);
  assert.equal(recommendSize(164, 50, 'P013').size, 'M');
  assert.equal(recommendSize(150, 40).size, 'XS');
});
test('修身上沿大一码，下沿不变；XL 上沿无法继续加码', () => {
  assert.equal(recommendSize(163, 52, 'P002').size, 'L');
  assert.equal(recommendSize(160, 53, 'P002').size, 'L');
  assert.equal(recommendSize(160, 50, 'P002').size, 'M');
  assert.throws(() => recommendSize(175, 70, 'P002'), /转人工/);
});
test('表格范围外、非法数字、未知商品不硬推荐', () => {
  for (const [h, w] of [[149, 50], [176, 50], [160, 39], [160, 71], [NaN, 50], [160, Infinity]]) assert.throws(() => recommendSize(h, w));
  assert.throws(() => recommendSize(160, 50, 'P999'), /没有找到/);
});
