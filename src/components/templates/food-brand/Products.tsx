"use client";

import { useState } from "react";
import Image from "next/image";
import { useReveal } from "@/hooks/useReveal";
import { useCart } from "@/lib/cart";
import { ProductModal } from "./ProductModal";
import type { ProductsContent, ProductItem } from "@/lib/types";

export function Products({ products }: { products: ProductsContent }) {
  const scrollRef = useReveal();
  const { addItem } = useCart();
  const [modalProduct, setModalProduct] = useState<ProductItem | null>(null);

  const featured = products.products.find((p) => p.featured) ?? products.products[0];
  const others = products.products.filter((p) => p.id !== featured?.id);

  const handleQuickAdd = (e: React.MouseEvent, product: ProductItem) => {
    e.stopPropagation();
    if (product.comingSoon || !product.price) return;
    addItem({
      productId: product.id,
      name: product.name,
      price: parseFloat(product.price),
      imageUrl: product.imageUrl,
      subscription: false,
    });
  };

  return (
    <>
      <section
        id="products"
        className="py-10 md:py-14"
        style={{ background: "var(--cream)" }}
      >
        <div className="container-main">
          {/* Header */}
          <div className="mb-10 md:mb-14">
            <div className="grid md:grid-cols-2 gap-6 md:gap-20 items-end">
              <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
                {products.headline}
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed max-w-md"
                style={{ color: "var(--bark-light)" }}
              >
                {products.description}
              </p>
            </div>
          </div>

          {/* Featured product */}
          {featured && (
            <div className="mb-8">
              <div className="grid md:grid-cols-5 gap-0 cursor-pointer group" onClick={() => setModalProduct(featured)}>
                <div className="md:col-span-3 relative aspect-[4/3] md:aspect-auto md:min-h-[500px] overflow-hidden">
                  {featured.imageUrl ? (
                    <Image
                      src={featured.imageUrl}
                      alt={featured.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      sizes="(min-width: 768px) 60vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-8 text-center" style={{ background: "var(--cream-mid)" }}>
                      <span className="font-display text-4xl tracking-tight" style={{ color: "var(--sage)" }}>
                        {featured.name}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className="md:col-span-2 p-8 md:p-12 lg:p-16 flex flex-col justify-center"
                  style={{ background: "var(--cream-dark)" }}
                >
                  {featured.badge && (
                    <span
                      className="text-[0.625rem] font-bold tracking-widest uppercase mb-4 inline-block"
                      style={{ color: "var(--sage)" }}
                    >
                      {featured.badge}
                    </span>
                  )}
                  <h3 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight mb-4">
                    {featured.name}
                  </h3>
                  <p
                    className="text-base leading-relaxed mb-6"
                    style={{ color: "var(--bark-light)" }}
                  >
                    {featured.description}
                  </p>
                  {featured.price && (
                    <p
                      className="font-display text-2xl md:text-3xl tracking-tight mb-4"
                      style={{ color: "var(--bark)" }}
                    >
                      ${featured.price}
                    </p>
                  )}
                  <div
                    className="flex items-center justify-between pt-6"
                    style={{ borderTop: "1px solid var(--cream-mid)" }}
                  >
                    <div>
                      <span
                        className="text-xs font-medium tracking-wider uppercase"
                        style={{ color: "var(--bark-faded)" }}
                      >
                        Ingredients
                      </span>
                      <p className="text-sm mt-1" style={{ color: "var(--bark-light)" }}>
                        {featured.ingredients}
                      </p>
                    </div>
                    {featured.comingSoon ? (
                      <span
                        className="text-xs font-bold tracking-widest uppercase px-5 py-2.5 shrink-0"
                        style={{ background: "var(--cream-mid)", color: "var(--bark-faded)" }}
                      >
                        Coming Soon
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleQuickAdd(e, featured); }}
                        className="text-xs font-bold tracking-widest uppercase px-5 py-2.5 transition-all duration-300 shrink-0"
                        style={{ background: "var(--bark)", color: "var(--cream)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bark-light)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bark)"; }}
                      >
                        Buy Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Other products */}
          {others.length > 0 && (
            <div ref={scrollRef} className="reveal">
              {/* Mobile scroll hint */}
              <p
                className="text-[0.625rem] tracking-widest uppercase mb-4 md:hidden"
                style={{ color: "var(--bark-faded)" }}
              >
                Scroll &rarr;
              </p>
              <div className="horizontal-scroll md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
                {others.map((product, i) => (
                  <div
                    key={product.id}
                    className={`w-[280px] md:w-auto reveal-delay-${Math.min(i + 1, 3)} cursor-pointer group`}
                    onClick={() => setModalProduct(product)}
                  >
                    <div className="relative aspect-square overflow-hidden">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 280px"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ background: "var(--cream-mid)" }}>
                          <span className="font-display text-2xl tracking-tight" style={{ color: "var(--sage)" }}>
                            {product.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-display text-xl tracking-tight">
                              {product.name}
                            </h3>
                            {product.badge && (
                              <span
                                className="text-[0.5625rem] font-bold tracking-widest uppercase"
                                style={{ color: "var(--sage)" }}
                              >
                                {product.badge}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-sm leading-relaxed mb-3"
                            style={{ color: "var(--bark-light)" }}
                          >
                            {product.description}
                          </p>
                          {product.price && (
                            <p
                              className="font-display text-xl tracking-tight mb-3"
                              style={{ color: "var(--bark)" }}
                            >
                              ${product.price}
                            </p>
                          )}
                          {product.comingSoon ? (
                            <span
                              className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase"
                              style={{ color: "var(--bark-faded)" }}
                            >
                              Coming Soon
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleQuickAdd(e, product)}
                              className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                              style={{ color: "var(--sage)" }}
                            >
                              Add to Cart &rarr;
                            </button>
                          )}
                        </div>
                        {/* Ingredient count — brand signature */}
                        <div className="flex-shrink-0 text-right">
                          <span
                            className="font-display text-3xl tracking-tight leading-none block"
                            style={{ color: "var(--sage)" }}
                          >
                            {product.ingredients ? product.ingredients.split(",").length : "2"}
                          </span>
                          <span
                            className="text-[0.5rem] tracking-widest uppercase"
                            style={{ color: "var(--bark-faded)" }}
                          >
                            ingredients
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {products.bottomNote && (
            <div
              className="mt-10 py-4 text-center"
              style={{ borderTop: "1px solid var(--cream-mid)", borderBottom: "1px solid var(--cream-mid)" }}
            >
              <p
                className="text-xs font-medium tracking-[0.15em] uppercase"
                style={{ color: "var(--bark-faded)" }}
              >
                {products.bottomNote}
              </p>
            </div>
          )}

        </div>
      </section>

      {/* Product modal */}
      <ProductModal
        product={modalProduct}
        onClose={() => setModalProduct(null)}
      />
    </>
  );
}
