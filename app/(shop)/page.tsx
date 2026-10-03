import { Suspense } from "react";
import { HomeContent } from "@/components/shop/HomeContent";

export default function ShopHomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
