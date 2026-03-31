"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  subscription: boolean;
  subscriptionInterval?: string; // e.g. "4 weeks"
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  toggleSubscription: (productId: string, interval?: string) => void;
  itemCount: number;
  subtotal: number;
  freeShippingThreshold: number;
  amountToFreeShipping: number;
}

const FREE_SHIPPING_THRESHOLD = 45;
const SUBSCRIPTION_DISCOUNT = 0.15;

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function getItemPrice(item: CartItem) {
  return item.subscription ? item.price * (1 - SUBSCRIPTION_DISCOUNT) : item.price;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("reb-cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("reb-cart", JSON.stringify(items));
  }, [items]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback(
    (newItem: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      setItems((prev) => {
        const existing = prev.find(
          (i) => i.productId === newItem.productId && i.subscription === newItem.subscription
        );
        if (existing) {
          return prev.map((i) =>
            i.productId === newItem.productId && i.subscription === newItem.subscription
              ? { ...i, quantity: i.quantity + (newItem.quantity ?? 1) }
              : i
          );
        }
        return [...prev, { ...newItem, quantity: newItem.quantity ?? 1 }];
      });
      setIsOpen(true);
    },
    []
  );

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity } : i))
    );
  }, []);

  const toggleSubscription = useCallback(
    (productId: string, interval?: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.productId === productId
            ? {
                ...i,
                subscription: !i.subscription,
                subscriptionInterval: !i.subscription ? interval ?? "4 weeks" : undefined,
              }
            : i
        )
      );
    },
    []
  );

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + getItemPrice(i) * i.quantity, 0);
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        toggleSubscription,
        itemCount,
        subtotal,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        amountToFreeShipping,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
