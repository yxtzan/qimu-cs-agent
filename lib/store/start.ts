/** Public-only HTTP entry point: authenticate the real socket peer before handing requests to Next. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import next from 'next';
import { loadEnvConfig } from '@next/env';
import { initializePeerSecret, signedPeerHeaders } from './public-peer';
import { startVisitorCleanup } from './visitor-context';

loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
async function main() {
  if (process.env.PUBLIC_DEMO !== '1') {
    const require = createRequire(join(process.cwd(), 'package.json'));
    const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', ...args], { stdio: 'inherit', env: process.env });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { child.kill(signal); });
    child.on('error', () => { process.exitCode = 1; });
    child.on('exit', code => { process.exit(code ?? 0); });
    return;
  }
  const portFlag = args.findIndex(arg => arg === '-p' || arg === '--port');
  const hostFlag = args.findIndex(arg => arg === '-H' || arg === '--hostname');
  const port = Number(portFlag < 0 ? process.env.PORT ?? 3000 : args[portFlag + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid public server port');
  const hostname = hostFlag < 0 ? '0.0.0.0' : args[hostFlag + 1];
  // The HTML middleware fetches loopback; keep custom CLI ports consistent with it.
  const app = next({ dev: false, dir: process.cwd(), hostname, port });
  await app.prepare();
  process.env.PORT = String(port);
  initializePeerSecret();
  startVisitorCleanup();
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    // Strip every supplied private peer header, then sign the actual TCP peer.
    delete request.headers['x-qimu-peer']; delete request.headers['x-qimu-peer-signature'];
    const forwarded = process.env.PUBLIC_DEMO_TRUST_PROXY === '1' ? request.headers['x-forwarded-for'] : undefined;
    const peer = (typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : undefined) || request.socket.remoteAddress || 'direct';
    Object.assign(request.headers, signedPeerHeaders(peer));
    void handle(request, response).catch(() => {
      if (!response.headersSent) { response.statusCode = 500; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '公开演示暂时不可用，请稍后再试' } })); }
      else response.end();
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, hostname, resolve); });
  console.log(`栖木公开演示已启动：http://localhost:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(() => { void app.close().finally(() => process.exit(0)); }); });
}
main().catch(error => { console.error('[qimu-start]', error instanceof Error ? error.name : 'UnknownError'); process.exitCode = 1; });
