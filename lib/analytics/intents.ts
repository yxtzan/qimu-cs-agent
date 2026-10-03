/**
 * 意图 → 阶段 的归属表（PRD 的售前 / 售中 / 售后 / 其他），看板按阶段聚合时用。
 * trace.stage 有值时以 trace 为准，没有时才查这张表。
 */
import type { IntentId, Stage } from "../types";

export const STAGE_OF_INTENT: Record<IntentId, Stage> = {
  product_consult: "presale",
  size_recommend: "presale",
  stock_check: "presale",
  promotion: "presale",
  shipping_policy: "presale",
  order_status: "insale",
  logistics_track: "insale",
  urge_shipping: "insale",
  modify_order: "insale",
  cancel_order: "insale",
  refund_apply: "aftersale",
  refund_progress: "aftersale",
  exchange: "aftersale",
  quality_issue: "aftersale",
  return_policy: "aftersale",
  invoice: "aftersale",
  human_request: "other",
  greeting: "other",
  multi_step_complex: "other",
  other: "other",
};

export const ALL_STAGES: Stage[] = ["presale", "insale", "aftersale", "other"];
