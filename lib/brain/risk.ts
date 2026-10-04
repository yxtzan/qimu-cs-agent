import type { DecideResult, RiskKey } from '../types';
export interface RiskResult { handoff: boolean; hits: RiskKey[]; flags: RiskKey[]; scores: Record<RiskKey, number> }
const hardPatterns = {
  legal_threat: /12315|消协|起诉|律师|报警|曝光/,
  health_safety: /过敏|起疹|红疹|受伤/,
  fraud_security: /盗号|被骗|诈骗/,
};
export function checkRisk(text: string, result?: DecideResult): RiskResult {
  const scores = {
    legal_threat: result?.risk.legal_threat ?? 0,
    health_safety: result?.risk.health_safety ?? 0,
    fraud_security: result?.risk.fraud_security ?? 0,
    abuse_extreme: result?.risk.abuse_extreme ?? 0,
    emotion: result?.risk.emotion.score ?? 0,
  };
  for (const key of Object.keys(hardPatterns) as (keyof typeof hardPatterns)[]) if (hardPatterns[key].test(text)) scores[key] = 1;
  const thresholds: Record<RiskKey, number> = { legal_threat: 0.7, health_safety: 0.7, fraud_security: 0.7, abuse_extreme: 0.8, emotion: 2.5 };
  const keys = Object.keys(scores) as RiskKey[];
  const hits = keys.filter(k => scores[k] >= thresholds[k]);
  const flags = keys.filter(k => scores[k] >= 0.5);
  return { handoff: hits.length > 0, hits, flags, scores };
}
