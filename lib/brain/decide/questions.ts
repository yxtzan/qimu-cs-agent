import type { IntentId, Stage } from "../../types";
import type { DecisionQuestion } from "../../llm/openrouter";

export interface IntentQuestion {
  id: IntentId;
  criteria: string;
  stage: Stage;
}

/** The single source shared by Jev, the JSON classifier and the mock classifier. */
export const INTENTS: readonly IntentQuestion[] = [
  { id: "product_consult", criteria: "询问商品的材质、版型、颜色、细节、洗护、是否适合某场合", stage: "presale" },
  { id: "size_recommend", criteria: "询问该穿什么尺码，常给出身高体重", stage: "presale" },
  { id: "stock_check", criteria: "询问某款某码某色是否有货、何时补货", stage: "presale" },
  { id: "promotion", criteria: "询问优惠、折扣、优惠券、满减、会员价", stage: "presale" },
  { id: "shipping_policy", criteria: "下单前询问发货时间、快递公司、运费、配送范围", stage: "presale" },
  { id: "order_status", criteria: "询问订单当前状态、是否付款成功、订单详情", stage: "insale" },
  { id: "logistics_track", criteria: "询问包裹到哪了、物流进度、何时送达", stage: "insale" },
  { id: "urge_shipping", criteria: "催促尽快发货", stage: "insale" },
  { id: "modify_order", criteria: "修改收货地址、电话或未发货订单的规格", stage: "insale" },
  { id: "cancel_order", criteria: "想取消尚未发货的订单", stage: "insale" },
  { id: "refund_apply", criteria: "想申请退款或退货退款", stage: "aftersale" },
  { id: "refund_progress", criteria: "询问退款/退货处理到哪一步、钱何时到账", stage: "aftersale" },
  { id: "exchange", criteria: "想换尺码或换颜色", stage: "aftersale" },
  { id: "quality_issue", criteria: "反映收到的商品有质量问题：破损、色差、起球、开线、异味", stage: "aftersale" },
  { id: "return_policy", criteria: "询问退换货规则、期限、运费谁出", stage: "aftersale" },
  { id: "invoice", criteria: "询问或申请发票", stage: "aftersale" },
  { id: "human_request", criteria: "明确要求人工客服", stage: "other" },
  { id: "greeting", criteria: "打招呼、感谢、结束语，没有具体诉求", stage: "other" },
  { id: "multi_step_complex", criteria: "一句话里有多个诉求，或需要多步查询/操作才能完成", stage: "other" },
  { id: "other", criteria: "与本店购物无关或无法判断", stage: "other" },
] as const;

export const INTENT_CRITERIA: Record<IntentId, string> = Object.fromEntries(
  INTENTS.map(({ id, criteria }) => [id, criteria]),
) as Record<IntentId, string>;

export const RISK_QUESTIONS = {
  legal_threat: {
    type: "noul" as const,
    instructions: "买家本人是否在威胁向监管部门（如 12315、消协）投诉、起诉、找律师，或曝光到媒体/社交平台？只是提到别人的职业或身份（例如「我朋友是律师」）不算。",
    criteria: { true: "买家本人明确威胁投诉、起诉、找律师或公开曝光", false: "没有买家本人的威胁，只提到别人的职业或身份也不算" },
  },
  health_safety: {
    type: "noul" as const,
    instructions: "买家是否说商品已经给自己或家人造成了身体伤害、过敏、皮肤问题、受伤或其他不适，或指出商品存在安全隐患？购买前询问材质、是否适合敏感肌、是否防过敏等咨询不算。",
    criteria: { true: "商品已经给买家或家人造成伤害、过敏、皮肤问题或不适，或存在安全隐患", false: "没有已经发生的伤害或安全隐患；购买前的材质、敏感肌、防过敏咨询不算" },
  },
  fraud_security: {
    type: "noul" as const,
    instructions: "是否涉及账号被盗、被诈骗、可疑链接、有人冒充客服，或被要求线下转账？",
    criteria: { true: "明确涉及盗号、诈骗、可疑链接、冒充客服或线下转账", false: "没有账号安全、诈骗或可疑交易问题" },
  },
  abuse_extreme: {
    type: "noul" as const,
    instructions: "消息是否包含辱骂、人身攻击或极端情绪？",
    criteria: { true: "包含明显辱骂、人身攻击或极端情绪", false: "没有明显辱骂、人身攻击或极端情绪" },
  },
} as const;

export const EMOTION_QUESTION = {
  type: "score" as const,
  instructions: "评估买家在新消息中的情绪激烈程度。",
  criteria: ["平静", "有些不满", "明显生气", "非常愤怒"],
};

export function buildDecisionQuestions(): Record<string, DecisionQuestion> {
  return {
    intent: {
      type: "choice",
      instructions: "买家这条新消息的主要意图是什么？结合最近对话和已知信息判断，只选择一个最符合的类别。",
      criteria: INTENT_CRITERIA,
    },
    multi_step: {
      type: "noul",
      instructions: "这条新消息是否包含两个及以上不同诉求，或需要多步查询/操作才能完成？",
      criteria: { true: "多个诉求或多步操作", false: "单一诉求且一步即可处理" },
    },
    ...RISK_QUESTIONS,
    emotion: EMOTION_QUESTION,
  };
}

export const INTENT_IDS = new Set<IntentId>(INTENTS.map(({ id }) => id));
