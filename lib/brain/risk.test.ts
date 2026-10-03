import assert from 'node:assert/strict';
import test from 'node:test';
import { decideWithMock } from './decide/mock';
import { checkRisk } from './risk';
test('hard keywords cover L1 and every mandated safety category', () => {
  for (const [word, key] of [['12315', 'legal_threat'], ['律师', 'legal_threat'], ['曝光', 'legal_threat'], ['过敏', 'health_safety'], ['红疹', 'health_safety'], ['受伤', 'health_safety'], ['盗号', 'fraud_security'], ['诈骗', 'fraud_security']]) {
    const result = checkRisk(`退款进度 ${word}`); assert(result.handoff); assert.equal(result.scores[key as keyof typeof result.scores], 1);
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
