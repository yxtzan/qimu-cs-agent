import type { DecideResult, IntentId } from "../../types";

const intentKeywords: [IntentId, string[]][] = [
  ["logistics_track", ["到哪", "物流", "快递", "包裹", "运单", "配送", "送到"]],
  ["refund_progress", ["退款进度", "退款到哪", "钱何时", "到账"]],
  ["refund_apply", ["退款", "退货"]],
  ["exchange", ["换码", "换尺码", "换颜色", "换货"]],
  ["size_recommend", ["尺码", "多大码", "穿什么码", "身高", "体重", "公斤", "斤"]],
  ["stock_check", ["有货", "库存", "补货"]],
  ["promotion", ["优惠", "折扣", "优惠券", "满减", "会员价"]],
  ["shipping_policy", ["发货时间", "运费", "配送范围", "快递公司"]],
  ["cancel_order", ["取消订单", "取消"]],
  ["modify_order", ["改地址", "修改地址", "改电话", "改尺码"]],
  ["quality_issue", ["破损", "色差", "起球", "开线", "异味", "质量问题"]],
  ["return_policy", ["退换货规则", "退货规则", "退货期限"]],
  ["order_status", ["订单状态", "付款成功", "订单详情"]],
  ["urge_shipping", ["催发货", "尽快发货", "怎么还不发"]],
  ["human_request", ["人工", "真人客服", "联系客服"]],
  ["invoice", ["发票"]],
  ["product_consult", ["材质", "版型", "颜色", "洗护", "怎么洗", "适合"]],
  ["greeting", ["你好", "您好", "谢谢", "再见"]],
];

const riskWords: Record<"legal_threat" | "health_safety" | "fraud_security" | "abuse_extreme", string[]> = {
  legal_threat: ["12315", "消协", "起诉", "律师", "报警", "曝光", "投诉"],
  health_safety: ["过敏", "起疹", "红疹", "受伤", "伤害", "安全隐患"],
  fraud_security: ["盗号", "被骗", "诈骗", "可疑链接", "冒充客服", "线下转账"],
  abuse_extreme: ["垃圾", "骗子", "脑残", "去死", "操你", "妈的"],
};

export function decideWithMock(message: string): DecideResult {
  const text = message.toLowerCase();
  const matched = intentKeywords.find(([, words]) => words.some((word) => text.includes(word)));
  const id = matched?.[0] ?? "other";
  const probabilities: Partial<Record<IntentId, number>> = { [id]: matched ? 0.9 : 0.55 };
  const multi = /另外|顺便|同时|以及|再帮我|两个|两件/.test(text) ? 0.9 : 0.05;
  const risk = { legal_threat: 0, health_safety: 0, fraud_security: 0, abuse_extreme: 0 };
  for (const [key, words] of Object.entries(riskWords) as [keyof typeof risk, string[]][]) if (words.some((word) => text.includes(word))) risk[key] = 1;
  let emotionScore = 0;
  if (/[!！]{2,}|气死|愤怒|太差|离谱/.test(text)) emotionScore = 2.6;
  if (risk.abuse_extreme) emotionScore = 3;
  return { provider: "mock", intent: { id, confidence: probabilities[id] ?? 0, probabilities }, multiStep: multi, risk: { ...risk, emotion: { score: emotionScore, confidence: emotionScore ? 0.9 : 0.8 } }, latencyMs: 0, costUsd: 0 };
}
