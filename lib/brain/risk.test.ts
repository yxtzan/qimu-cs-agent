import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecideResult } from '../types';
import { decideWithMock } from './decide/mock';
import { checkRisk, hasKeywordHit, yellowKeys } from './risk';
test('hard keywords cover L1 and every mandated safety category', () => {
  for (const [word, key] of [['12315', 'legal_threat'], ['律师', 'legal_threat'], ['曝光', 'legal_threat'], ['过敏', 'health_safety'], ['红疹', 'health_safety'], ['受伤', 'health_safety'], ['盗号', 'fraud_security'], ['诈骗', 'fraud_security']]) {
    const result = checkRisk(`退款进度 ${word}`); assert(result.handoff); assert.equal(result.scores[key as keyof typeof result.scores], 1);
    assert(hasKeywordHit(`退款进度 ${word}`));
  }
});
test('model thresholds and yellow flags are separate, including emotion scale', () => {
  const model = decideWithMock('您好');
  model.risk.legal_threat = 0.69; model.risk.health_safety = 0.5; model.risk.abuse_extreme = 0.79; model.risk.emotion.score = 2.49;
  assert.equal(checkRisk('您好', model).handoff, false);
  assert(checkRisk('您好', model).flags.includes('health_safety'));
  model.risk.legal_threat = 0.7; model.risk.abuse_extreme = 0.8; model.risk.emotion.score = 2.5;
  assert.deepEqual(checkRisk('您好', model).hits, ['legal_threat', 'abuse_extreme', 'emotion']);
  assert.equal(checkRisk('受伤', model).scores.health_safety, 1);
});
test('emotion yellow flag starts at 1.5 on the 0–3 scale; the four risk items still flag at 0.5', () => {
  const model = decideWithMock('您好');
  model.risk.emotion.score = 0.5;
  assert.deepEqual(checkRisk('您好', model).flags, [], 'emotion 0.5 is calm, not yellow');
  model.risk.emotion.score = 1.49;
  assert.deepEqual(checkRisk('您好', model).flags, []);
  model.risk.emotion.score = 1.5;
  assert.deepEqual(checkRisk('您好', model).flags, ['emotion']);
  assert.equal(checkRisk('您好', model).handoff, false);
  model.risk.emotion.score = 2.49;
  assert.equal(checkRisk('您好', model).handoff, false);
  model.risk.emotion.score = 0; model.risk.fraud_security = 0.49;
  assert.deepEqual(checkRisk('您好', model).flags, []);
  model.risk.fraud_security = 0.5;
  assert.deepEqual(checkRisk('您好', model).flags, ['fraud_security']);
  assert.deepEqual(yellowKeys({ emotion: 1.5, legal_threat: 0.49 }), ['emotion']);
  assert.deepEqual(yellowKeys(undefined), []);
});
const realModel = (provider: DecideResult['provider'], risk: Partial<Record<'legal_threat' | 'health_safety' | 'fraud_security' | 'abuse_extreme', number>> = {}): DecideResult => {
  const model = decideWithMock('您好');
  return { ...model, provider, risk: { ...model.risk, ...risk } };
};
test('a keyword hit is downgraded to yellow only when a real model clearly says no (< 0.3)', () => {
  for (const provider of ['jev', 'llm'] as const) {
    const risk = checkRisk('我闺蜜是律师', realModel(provider, { legal_threat: 0.1 }));
    assert.equal(risk.handoff, false); assert.deepEqual(risk.downgraded, ['legal_threat']);
    assert(risk.flags.includes('legal_threat'), 'downgraded keyword stays a yellow flag');
    assert.deepEqual(risk.hits, []);
  }
  assert.equal(checkRisk('律师', realModel('jev', { legal_threat: 0.29 })).handoff, false);
});
test('a keyword hit still hands off when the model is unsure, unavailable, or mock', () => {
  assert.equal(checkRisk('律师', realModel('jev', { legal_threat: 0.3 })).handoff, true);
  assert.equal(checkRisk('律师', realModel('llm', { legal_threat: 0.9 })).handoff, true);
  assert.equal(checkRisk('律师', realModel('mock', { legal_threat: 0 })).handoff, true);
  assert.equal(checkRisk('律师').handoff, true, 'no decision at all');
});
test('downgrade is per risk item: another keyword or a model hit still hands off', () => {
  const both = checkRisk('律师说我过敏了', realModel('jev', { legal_threat: 0.1, health_safety: 0.6 }));
  assert.equal(both.handoff, true); assert.deepEqual(both.hits, ['health_safety']); assert.deepEqual(both.downgraded, ['legal_threat']);
  const modelOnly = checkRisk('律师', realModel('jev', { legal_threat: 0.1, fraud_security: 0.9 }));
  assert.deepEqual(modelOnly.hits, ['fraud_security']);
});
