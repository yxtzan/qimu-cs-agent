import { NextRequest, NextResponse } from 'next/server';

const SID_COOKIE = 'qimu_sid';
const SID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const config = { matcher: ['/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)'], runtime: 'nodejs' };

export async function middleware(request: NextRequest) {
  if (process.env.PUBLIC_DEMO !== '1') return NextResponse.next();
  const existing = request.cookies.get(SID_COOKIE)?.value;
  const sid = existing && SID_PATTERN.test(existing) ? existing : crypto.randomUUID();
  const headers = new Headers(request.headers);
  const cookies = headers.get('cookie')?.split(';').filter(value => !value.trim().startsWith(`${SID_COOKIE}=`)) ?? [];
  headers.set('cookie', [...cookies, `${SID_COOKIE}=${sid}`].join('; '));
  let response: NextResponse;
  const html = request.method === 'GET' && !request.nextUrl.pathname.startsWith('/api/') && request.headers.get('accept')?.includes('text/html') && !request.headers.has('rsc');
  if (html && request.headers.get('x-qimu-html') !== '1') {
    // Fetch only our own loopback server; do not forward upstream host/proxy headers.
    const port = process.env.PORT || '3000';
    const target = new URL(`http://127.0.0.1:${port}`);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    headers.set('x-qimu-html', '1');
    headers.delete('host'); headers.delete('accept-encoding');
    headers.delete('if-none-match'); headers.delete('if-modified-since');
    const upstream = await fetch(target, { headers, redirect: 'manual', signal: request.signal });
    const outgoing = new Headers(upstream.headers);
    outgoing.delete('content-length'); outgoing.delete('content-encoding'); outgoing.delete('etag');
    let body: ReadableStream<Uint8Array> | null = upstream.body;
    if (body && outgoing.get('content-type')?.includes('text/html')) {
      const decoder = new TextDecoder(), encoder = new TextEncoder();
      let buffer = '', inserted = false;
      body = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          if (inserted) { controller.enqueue(encoder.encode(text)); return; }
          buffer += text;
          const at = buffer.indexOf('</head>');
          if (at >= 0) {
            controller.enqueue(encoder.encode(buffer.slice(0, at) + '<script src="/api/demo/banner" defer></script>' + buffer.slice(at)));
            buffer = ''; inserted = true;
          }
        },
        flush(controller) { const tail = buffer + decoder.decode(); if (tail) controller.enqueue(encoder.encode(tail)); },
      }));
    }
    response = new NextResponse(body, { status: upstream.status, headers: outgoing });
  } else response = NextResponse.next({ request: { headers } });
  if (sid !== existing) response.cookies.set(SID_COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https', path: '/', maxAge: 7 * 86400 });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
