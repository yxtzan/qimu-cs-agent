import { publicDemo } from '@/lib/store/visitor-context';
export const dynamic = 'force-dynamic';
/** Kept outside React's managed DOM; survives client navigation without editing components. */
export function GET() {
  if (!publicDemo()) return new Response('', { status: 404 });
  const script = `(() => {
    if (window.__qimuBudgetBanner) return;
    window.__qimuBudgetBanner = true;
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'public-budget-banner');
    host.style.cssText = 'position:fixed;inset:0 0 auto;z-index:2147483647;display:none';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = '<style>div{box-sizing:border-box;padding:10px 16px;background:#fff4d6;color:#664300;font:14px/1.5 system-ui;text-align:center;border-bottom:1px solid #ead49a}</style><div role="status"></div>';
    document.documentElement.appendChild(host);
    const offsetStyle = document.createElement('style');
    offsetStyle.textContent = 'body{padding-top:var(--qimu-budget-offset,0px)!important}body header.sticky.top-0{top:var(--qimu-budget-offset,0px)!important}body .h-dvh{height:calc(100dvh - var(--qimu-budget-offset,0px))!important}body .min-h-dvh{min-height:calc(100dvh - var(--qimu-budget-offset,0px))!important}@media(min-width:768px){body .h-dvh{height:min(900px,calc(100dvh - 48px - var(--qimu-budget-offset,0px)))!important}}';
    document.head.appendChild(offsetStyle);
    function offset() {
      document.documentElement.style.setProperty('--qimu-budget-offset', host.style.display === 'none' ? '0px' : host.getBoundingClientRect().height + 'px');
    }
    new ResizeObserver(offset).observe(host);
    let pending = false;
    async function update() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const res = await fetch('/api/demo/status', {cache:'no-store'});
        if (!res.ok) return;
        const value = await res.json();
        root.querySelector('[role="status"]').textContent = value.message;
        host.style.display = value.simplified ? 'block' : 'none';
        offset();
      } catch {} finally { pending = false; }
    }
    update(); setInterval(update, 5000);
    document.addEventListener('visibilitychange', update);
  })();`;
  return new Response(script, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
}
