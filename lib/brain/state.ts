import { nowIso } from '../demo-clock';
import { getOrder, getProduct, listOrders } from '../store/collections';
import type { ActionRecord, ChatMessage, Conversation, DialogState, Slots } from '../types';
import { extractSlots } from './slots';

export interface ChatContext { orderId?: string; productId?: string; page?: 'home' | 'product' | 'orders' | 'order_detail' }
export function addHistory(state: DialogState, type: ActionRecord['type'], name: string, summary: string): void {
  state.history = [...state.history, { type, name, summary, at: nowIso() }].slice(-10);
}

function referencedOrder(buyerId: string, text: string): string | undefined {
  const words = ['碎花', '茶歇裙', '大衣', '外套', '衬衫', '西装裤', '开衫', '连衣裙', '裤子'].filter(w => text.includes(w));
  if (!words.length) return;
  let orders = listOrders(buyerId).filter(o => o.items.some(i => words.some(w => i.productName.includes(w) || getProduct(i.productId)?.category.includes(w))));
  const month = /([一二三四五六七八九十]{1,3}|\d{1,2})月/.exec(text)?.[1];
  if (month) {
    const months: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
    const m = months[month] ?? Number(month);
    orders = orders.filter(o => Number(o.createdAt.slice(5, 7)) === m);
    if (/中旬/.test(text)) orders = orders.filter(o => Number(o.createdAt.slice(8, 10)) >= 11 && Number(o.createdAt.slice(8, 10)) <= 20);
    if (/上旬/.test(text)) orders = orders.filter(o => Number(o.createdAt.slice(8, 10)) <= 10);
    if (/下旬/.test(text)) orders = orders.filter(o => Number(o.createdAt.slice(8, 10)) >= 21);
  }
  return orders.length === 1 ? orders[0].id : undefined;
}

export function updateState(conversation: Conversation, text: string, context: ChatContext = {}, selected: Slots = {}): DialogState {
  const state = structuredClone(conversation.state);
  const extracted = extractSlots(text);
  if (!extracted.orderId && !context.orderId && !selected.orderId) extracted.orderId = referencedOrder(conversation.buyerId, text);
  const nextOrder = context.orderId ?? selected.orderId ?? extracted.orderId;
  if (nextOrder && nextOrder !== state.slots.orderId) {
    delete state.slots.itemId;
    delete state.slots.productId;
    delete state.slots.size;
    delete state.slots.color;
    delete state.slots.reason;
    delete state.slots.address;
  }
  const defined = Object.fromEntries(Object.entries(extracted).filter(([, v]) => v !== undefined));
  state.slots = { ...state.slots, ...defined, ...selected, ...(context.orderId ? { orderId: context.orderId } : {}), ...(context.productId ? { productId: context.productId } : {}) };
  if (state.slots.orderId) {
    const order = getOrder(state.slots.orderId);
    if (order?.buyerId === conversation.buyerId && order.items.length === 1) {
      state.slots.itemId ??= order.items[0].itemId;
      state.slots.productId ??= order.items[0].productId;
    }
  }
  state.turnCount++;
  return state;
}

export function serializeStateForModel(conversation: Conversation, messages: ChatMessage[]): Record<string, unknown> {
  const { state } = conversation;
  const order = state.slots.orderId ? getOrder(state.slots.orderId) : undefined;
  const product = state.slots.productId ? getProduct(state.slots.productId) : undefined;
  return {
    最近对话: messages.slice(-6).map(m => `${m.role === 'buyer' ? '买家' : '客服'}：${m.text.slice(0, 120)}`),
    当前任务: state.currentTask ?? '无',
    已知信息: {
      ...state.slots,
      ...(order?.buyerId === conversation.buyerId ? { 订单: `${order.id}，${order.status}，${order.items.map(i => i.productName).join('、')}，售后：${order.afterSales.map(a => `${a.id} ${a.status}`).join('、') || '无'}` } : {}),
      ...(product ? { 商品: `${product.name}，${product.fit}，${product.material}` } : {}),
    },
    最近动作: state.history.slice(-3).map(h => h.summary),
  };
}
