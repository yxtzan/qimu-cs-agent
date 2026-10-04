import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSlots } from './slots';
const slots = (text: string) => extractSlots(text, ['燕麦色', '炭灰', '蓝底白花']);
test('order and product identifiers do not become measurements', () => {
  assert.deepEqual(slots('订单QM2026092801 P007'), { orderId: 'QM2026092801', productId: 'P007' });
  assert.deepEqual(slots('QM123456789012'), {});
});
test('height, kg and jin including decimals', () => {
  assert.deepEqual(slots('我160 50公斤穿什么码'), { heightCm: 160, weightKg: 50 });
  assert.deepEqual(slots('身高 165cm 108斤'), { heightCm: 165, weightKg: 54 });
  assert.deepEqual(slots('160.5厘米 100.5斤'), { heightCm: 160.5, weightKg: 50.25 });
  assert.deepEqual(slots('体重150公斤'), { weightKg: 150 });
  assert.deepEqual(slots('体重150.5公斤'), { weightKg: 150.5 });
  assert.deepEqual(slots('手机号13800000000'), {});
});
test('Latin and Chinese sizes, including an adjacent Chinese question', () => {
  for (const [text, size] of [['能换L吗', 'L'], ['xs码', 'XS'], ['XL', 'XL'], ['大码', 'L'], ['中码', 'M'], ['小码', 'S'], ['加大码', 'XL']]) assert.equal(slots(text).size, size);
  assert.equal(slots('XXL').size, undefined);
  assert.equal(slots('hello').size, undefined);
});
test('longest matching color and explicit address fields', () => {
  assert.equal(slots('换成燕麦色大码').color, '燕麦色');
  assert.deepEqual(slots('姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地址：示例路1号').address, { name: '林小满', phone: '138****0001', region: '浙江省 杭州市 西湖区', detail: '示例路1号' });
  assert.equal(slots('帮我改地址').address, undefined);
});
