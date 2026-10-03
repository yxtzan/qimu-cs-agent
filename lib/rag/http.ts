import { ApiError } from '../store/http';
import { MAX_DOCUMENT_BYTES, validateDocument } from './index';

export async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new ApiError('BAD_REQUEST', '请求不是有效 JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('BAD_REQUEST', '请提供 JSON 对象', 400);
  return body as Record<string, unknown>;
}
export async function readImport(request: Request): Promise<{ title: string; content: string; source: 'paste' | 'upload' }> {
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await request.formData(); } catch { throw new ApiError('BAD_REQUEST', '上传格式无效，请选择 Markdown 或文本文件', 400); }
    const file = form.get('file');
    if (!(file instanceof File) || !/\.(md|txt)$/i.test(file.name)) throw new ApiError('BAD_REQUEST', '仅支持 .md 或 .txt 文件', 400);
    if (file.size > MAX_DOCUMENT_BYTES) throw new ApiError('TOO_LARGE', '文档不能超过 1MB', 413);
    const suppliedTitle = form.get('title');
    const title = suppliedTitle ?? file.name.replace(/\.(md|txt)$/i, '');
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new ApiError('BAD_REQUEST', '请上传 UTF-8 编码的文本文件', 400); }
    validateDocument(title, content);
    return { title, content, source: 'upload' };
  }
  const body = await jsonObject(request);
  validateDocument(body.title, body.content);
  return { title: body.title, content: body.content as string, source: 'paste' };
}
