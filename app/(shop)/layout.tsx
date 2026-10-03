import { Footer } from "@/components/shop/Footer";
import { ShopProvider } from "@/components/shop/ShopProvider";
import { TopBar } from "@/components/shop/TopBar";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <TopBar />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </ShopProvider>
  );
}
