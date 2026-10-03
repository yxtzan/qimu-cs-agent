import { ConversationScreen } from "@/components/seller/ConversationScreen";

export const metadata = { title: "会话详情" };

export default async function SellerConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationScreen id={id} />;
}
