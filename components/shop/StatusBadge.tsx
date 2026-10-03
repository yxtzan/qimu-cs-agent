import type { AfterSaleStatus, OrderStatus } from "@/lib/types";
import {
  AFTER_SALE_STATUS_LABEL,
  AFTER_SALE_STATUS_TONE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  TONE_CLASS,
} from "./labels";
import type { Tone } from "./labels";

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function AfterSaleStatusBadge({ status }: { status: AfterSaleStatus }) {
  return <Badge tone={AFTER_SALE_STATUS_TONE[status]}>{AFTER_SALE_STATUS_LABEL[status]}</Badge>;
}

export function PlainBadge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}
