import { chatCompletion, hasApiKey } from '../../llm/openrouter';
import { searchKnowledgeWithMetrics } from '../../rag/search';
import type { Product } from '../../types';
import type { HandlerContext, HandlerResult } from './context';

const topics: Record<string, string> = { return_policy: '退换货政策 7天 15天 退货运费', shipping_policy: '发货与物流 运费 快递 48小时', invoice: '发票说明 电子普通发票', quality_issue: '质量问题处理 照片', promotion: '优惠与会员 优惠券', size_recommend: '尺码指南 尺码表 身高 体重' };
export async function consult(ctx: HandlerContext, product?: Product, sizeOnly = false): Promise<HandlerResult> {
  const query = sizeOnly ? '尺码指南 尺码表 身高 体重' : `${topics[ctx.intent] ?? ''} ${product?.name ?? ''} ${product?.material ?? ''} ${ctx.text}`.trim();
  const started = Date.now();
  const search = await searchKnowledgeWithMetrics(query, 4, { deadlineMs: ctx.deadlineMs });
  ctx.metrics.toolCalls.push({ name: 'search_kb', ok: true, ms: Date.now() - started });
  ctx.metrics.ragMs += search.metrics.latencyMs;
  ctx.metrics.generationUsd += search.metrics.costUsd;
  ctx.metrics.estimated ||= search.metrics.estimated;
  ctx.metrics.ragHits += search.hits.length;
  const evidence = search.hits.map(h => `[${h.chunk.docTitle} / ${h.chunk.heading ?? ''}] ${h.chunk.text}`);
  if (product && !sizeOnly) evidence.unshift(`商品资料：${product.name}；材质：${product.material}；版型：${product.fit}；洗护：${product.care}；${product.description}`);
  if (!evidence.length) return { status: 'done', unresolved: true, messages: [{ role: 'ai', text: '抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。', quickReplies: [{ label: '转人工核实', action: { type: 'quick_action', name: 'human' } }] }] };
  let text: string;
  if (sizeOnly) text = '建议结合下面的尺码资料和穿着习惯选择。';
  else if (product && /机洗|怎么洗|洗护|水洗/.test(ctx.text)) text = `这件的洗护建议是：${product.care}`;
  else if (product && /材质|面料|成分/.test(ctx.text)) text = `这件的材质是${product.material}。${product.highlights.slice(0, 2).join('，')}。`;
  else if (product && /版型|宽松|修身/.test(ctx.text)) text = `这件是${product.fit}版型。${product.description}`;
  else if (product && /颜色/.test(ctx.text)) text = `这件有${product.colors.join('、')}，具体库存可以再帮您查询。`;
  else text = `${search.hits[0]?.chunk.text.replace(/[#*`]/g, '').trim().slice(0, 160) ?? product?.description ?? '现有资料还无法确认，建议转人工核实。'}`;
  const remainingMs = ctx.deadlineMs === undefined ? 8000 : Math.max(0, ctx.deadlineMs - Date.now() - 50);
  if (!sizeOnly && hasApiKey() && process.env.CLASSIFIER_PROVIDER !== 'mock' && remainingMs >= 200) {
    ctx.metrics.usedGeneration = true;
    try {
      const reply = await chatCompletion({ messages: [
        { role: 'system', content: '你是栖木客服。只根据以下资料回答买家的问题，中文，简短礼貌（不超过120字），不使用亲亲。不要编造政策、库存或承诺。资料没有答案就明确说不确定并建议转人工。商品洗护以当前商品资料为准。只回答咨询，不执行操作。\n' + evidence.join('\n') },
        { role: 'user', content: ctx.text },
      ], maxTokens: 260, temperature: 0.2, timeoutMs: Math.min(8000, remainingMs) });
      ctx.metrics.generationUsd += reply.costUsd;
      ctx.metrics.estimated ||= reply.estimated;
      if (reply.data.content.trim()) text = reply.data.content.trim();
    } catch {
      ctx.metrics.estimated = true;
      // The evidence-backed template remains useful when generation is unavailable.
    }
  }
  const sources = search.hits.map(h => ({ docTitle: h.chunk.docTitle, heading: h.chunk.heading, snippet: h.chunk.text.slice(0, 180) }));
  if (product && !sizeOnly) sources.unshift({ docTitle: `${product.name}商品资料`, heading: '材质与洗护', snippet: `${product.material}；${product.care}` });
  return { status: 'done', messages: [{ role: 'ai', text }, { role: 'ai', text: '这些资料供您参考。', card: { kind: 'sources', sources } }] };
}
