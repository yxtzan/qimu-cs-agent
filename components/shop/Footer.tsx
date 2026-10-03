import { GuideLink } from "./GuideLink";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-warm">
        <div>
          <span className="font-medium text-brand">栖木 QIMU</span>
          <span className="ml-3">慢一点，穿久一点</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>满 ¥99 包邮</span>
          <span>7 天无理由退换</span>
          <span>智能客服 24 小时 · 人工客服 9:00–23:00</span>
        </div>
        <div className="text-xs">演示商城 · 所有商品与订单均为虚构数据 · <GuideLink /></div>
      </div>
    </footer>
  );
}
