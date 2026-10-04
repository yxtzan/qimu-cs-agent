import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PEER = 'x-qimu-peer';
const SIGNATURE = 'x-qimu-peer-signature';
/** A per-process internal secret prevents public clients forging the socket address. */
export function initializePeerSecret(): void { process.env.QIMU_INTERNAL_PEER_SECRET = randomBytes(32).toString('hex'); }
export function signedPeerHeaders(address: string): Record<string, string> {
  const secret = process.env.QIMU_INTERNAL_PEER_SECRET;
  if (!secret) throw new Error('Public server peer verification is not initialized');
  return { [PEER]: address, [SIGNATURE]: createHmac('sha256', secret).update(address).digest('hex') };
}
export function verifiedPeer(headers: Headers): string | undefined {
  const secret = process.env.QIMU_INTERNAL_PEER_SECRET, address = headers.get(PEER), signature = headers.get(SIGNATURE);
  if (!secret || !address || !signature || !/^[a-f0-9]{64}$/.test(signature)) return;
  const expected = createHmac('sha256', secret).update(address).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? address : undefined;
}
