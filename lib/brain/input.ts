import { getBuyer, getOrder, getProduct } from '../store/collections';
import { getConversation, listMessages } from '../store/conversations';
import { ApiError } from '../store/http';
import type { ChatAction, Conversation, Slots } from '../types';
import type { ChatContext } from './state';
import { quickLabels } from './rules';
export interface ChatRequest { buyerId: string; conversationId?: string; text?: string; action?: ChatAction; context?: ChatContext; debug?: boolean }
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
function fail(message: string): never { throw new ApiError('BAD_REQUEST', message, 400); }
export function parseChatRequest(value: unknown): ChatRequest {
  if (!object(value)) fail('请输入有效的聊天请求');
  if (typeof value.buyerId !== 'string' || !value.buyerId.trim()) fail('请提供买家编号');
  if (value.text !== undefined && (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2000)) fail('消息需要为1–2000字');
  if (value.conversationId !== undefined && (typeof value.conversationId !== 'string' || !value.conversationId.trim())) fail('会话编号格式错误');
  if (value.debug !== undefined && typeof value.debug !== 'boolean') fail('调试参数格式错误');
  if (value.action !== undefined) {
    const a = value.action;
    if (!object(a)) fail('聊天动作格式错误');
    if (a.type === 'quick_action') { if (typeof a.name !== 'string' || !Object.hasOwn(quickLabels, a.name)) fail('未知的快捷动作'); }
    else if (a.type === 'confirm') { if (typeof a.pendingActionId !== 'string' || !a.pendingActionId.trim() || typeof a.confirm !== 'boolean') fail('确认动作格式错误'); }
    else if (a.type === 'select_option') { if (typeof a.value !== 'string' || !a.value.trim()) fail('请选择有效选项'); }
    else if (a.type === 'text') { if (typeof a.text !== 'string' || !a.text.trim() || a.text.length > 2000) fail('消息需要为1–2000字'); }
    else fail('未知的聊天动作');
  }
  if (!value.text && !value.action) fail('请提供消息或聊天动作');
  if (value.context !== undefined) {
    const c = value.context;
    if (!object(c)) fail('页面上下文格式错误');
    if (c.orderId !== undefined && (typeof c.orderId !== 'string' || !/^QM\d{10}$/.test(c.orderId))) fail('订单编号格式错误');
    if (c.productId !== undefined && (typeof c.productId !== 'string' || !/^P\d{3}$/.test(c.productId))) fail('商品编号格式错误');
    if (c.page !== undefined && !['home', 'product', 'orders', 'order_detail'].includes(c.page as string)) fail('页面类型格式错误');
  }
  return value as unknown as ChatRequest;
}
export function validateIdentity(request: ChatRequest): Conversation | undefined {
  if (!getBuyer(request.buyerId)) throw new ApiError('NOT_FOUND', '没有找到这位买家', 404);
  const conversation = request.conversationId ? getConversation(request.conversationId) : undefined;
  if (request.conversationId && !conversation) throw new ApiError('NOT_FOUND', '没有找到这个会话', 404);
  if (conversation && conversation.buyerId !== request.buyerId) throw new ApiError('FORBIDDEN', '不能访问其他买家的会话', 403);
  if (request.context?.orderId) {
    const order = getOrder(request.context.orderId);
    if (!order) throw new ApiError('NOT_FOUND', '没有找到这个订单', 404);
    if (order.buyerId !== request.buyerId) throw new ApiError('FORBIDDEN', '不能访问其他买家的订单', 403);
  }
  if (request.context?.productId && !getProduct(request.context.productId)) throw new ApiError('NOT_FOUND', '没有找到这个商品', 404);
  return conversation;
}
export function describeInput(request: ChatRequest, conversation: Conversation): { text: string; selected: Slots } {
  const a = request.action;
  let label = request.text?.trim() ?? '';
  const selected: Slots = {};
  if (a?.type === 'quick_action') label = quickLabels[a.name];
  if (a?.type === 'confirm') label = a.confirm ? '确认办理' : '取消办理';
  if (a?.type === 'text') label = a.text.trim();
  if (a?.type === 'select_option') {
    const card = listMessages(conversation.id).filter(m => m.role === 'ai' && m.card?.kind === 'options').at(-1)?.card;
    const option = card?.kind === 'options' ? card.options.find(o => o.value === a.value) : undefined;
    if (!option || conversation.state.currentTask?.status !== 'collecting') fail('这个选项已失效，请重新选择或说明您的需求');
    label = option.label;
    if (a.value.startsWith('order:')) selected.orderId = a.value.slice(6);
    else if (a.value.startsWith('item:')) selected.itemId = a.value.slice(5);
    else if (a.value.startsWith('product:')) selected.productId = a.value.slice(8);
    else fail('无法识别这个选项，请重新说明您的需求');
  }
  // A button must never hide a concurrently supplied threat in text.
  if (a && request.text?.trim() && request.text.trim() !== label) label += `，${request.text.trim()}`;
  return { text: label, selected };
}
