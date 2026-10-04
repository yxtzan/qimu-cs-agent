import type { DecideResult, RiskKey } from '../types';
export interface RiskResult {
  handoff: boolean;
  hits: RiskKey[];
  /** Yellow-or-above: score reached the flag threshold (emotion is a 0–3 scale). */
  flags: RiskKey[];
  scores: Record<RiskKey, number>;
  /** Keyword matched, but a real model clearly said no (< 0.3): flagged yellow instead of handing off (D011). */
  downgraded: RiskKey[];
}
const hardPatterns = {
  legal_threat: /12315|消协|起诉|律师|报警|曝光/,
  health_safety: /过敏|起疹|红疹|受伤/,
  fraud_security: /盗号|被骗|诈骗/,
};
const handoffThresholds: Record<RiskKey, number> = { legal_threat: 0.7, health_safety: 0.7, fraud_security: 0.7, abuse_extreme: 0.8, emotion: 2.5 };
// Emotion is 0–3, so its yellow line is 1.5; the four risk items are 0–1 and flag at 0.5.
const yellowThresholds: Record<RiskKey, number> = { legal_threat: 0.5, health_safety: 0.5, fraud_security: 0.5, abuse_extreme: 0.5, emotion: 1.5 };
/** A keyword hit is overruled only when a real model (not mock) scores that item below this. */
export const KEYWORD_DOWNGRADE_BELOW = 0.3;
const riskKeys = Object.keys(handoffThresholds) as RiskKey[];

/** Items whose score reached the yellow line (includes items that also reached the handoff line). */
export function yellowKeys(scores: Partial<Record<RiskKey, number>> | undefined): RiskKey[] {
  return riskKeys.filter(k => (scores?.[k] ?? 0) >= yellowThresholds[k]);
}
export function hasKeywordHit(text: string): boolean {
  return (Object.keys(hardPatterns) as (keyof typeof hardPatterns)[]).some(key => hardPatterns[key].test(text));
}
const isRealModel = (result?: DecideResult): result is DecideResult => result?.provider === 'jev' || result?.provider === 'llm';

export function checkRisk(text: string, result?: DecideResult): RiskResult {
  const modelScores: Record<RiskKey, number> = {
    legal_threat: result?.risk.legal_threat ?? 0,
    health_safety: result?.risk.health_safety ?? 0,
    fraud_security: result?.risk.fraud_security ?? 0,
    abuse_extreme: result?.risk.abuse_extreme ?? 0,
    emotion: result?.risk.emotion.score ?? 0,
  };
  const scores = { ...modelScores };
  const downgraded: RiskKey[] = [];
  for (const key of Object.keys(hardPatterns) as (keyof typeof hardPatterns)[]) {
    if (!hardPatterns[key].test(text)) continue;
    scores[key] = 1;
    // Mock or a failed decide never overrules a keyword: better to over-transfer than to miss a threat.
    if (isRealModel(result) && modelScores[key] < KEYWORD_DOWNGRADE_BELOW) downgraded.push(key);
  }
  const hits = riskKeys.filter(k => scores[k] >= handoffThresholds[k] && !downgraded.includes(k));
  const flags = yellowKeys(scores);
  return { handoff: hits.length > 0, hits, flags, scores, downgraded };
}
