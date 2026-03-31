"use client";

import { CartProvider } from "@/lib/cart";
import { CartDrawer } from "./CartDrawer";
import { AnnouncementBar } from "./AnnouncementBar";

export function CartLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <AnnouncementBar />
      {children}
      <CartDrawer />
    </CartProvider>
  );
}
