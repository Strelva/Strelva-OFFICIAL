interface InstagramFeedProps {
  handle: string;
  /** Curated post URLs — picked by the site builder, not auto-fetched */
  posts?: string[];
}

/**
 * Instagram section using curated outbound post cards.
 * Zero tokens, zero API keys, zero action from the account owner.
 *
 * Posts are curated (you pick which ones to show), not auto-fetched or embedded.
 * This is intentional — curated > chronological for a business site.
 *
 * To update: change the post URLs in the content section or page config props.
 * The AI agent can do this via chat: "update my Instagram posts on the homepage"
 */
export function InstagramFeed({ handle, posts }: InstagramFeedProps) {
  // No handle configured — skip entire section
  if (!handle) return null;

  // No posts configured — show a CTA to the Instagram profile
  if (!posts || posts.length === 0) {
    return (
      <section className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
        <div className="container-main text-center">
          <h2
            className="font-display text-3xl md:text-4xl tracking-tight mb-4"
            style={{ color: "var(--bark)" }}
          >
            Follow Along
          </h2>
          <p className="text-base mb-6" style={{ color: "var(--bark-light)" }}>
            See behind the scenes, client work, and updates.
          </p>
          <a
            href={`https://instagram.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold tracking-widest uppercase px-8 py-3.5 transition-all duration-300"
            style={{ background: "var(--sage)", color: "var(--pure-white)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
            @{handle}
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div className="flex items-center justify-between mb-8">
          <h2
            className="font-display text-3xl md:text-4xl tracking-tight"
            style={{ color: "var(--bark)" }}
          >
            Follow Along
          </h2>
          <a
            href={`https://instagram.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-60"
            style={{ color: "var(--sage)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
            @{handle}
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((url, i) => (
            <a
              key={`${url}-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl overflow-hidden transition-transform duration-300 hover:-translate-y-1"
              style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}
            >
              <div
                className="aspect-square flex flex-col items-center justify-center p-8 text-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--cream-dark), var(--pure-white))",
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ color: "var(--sage)" }}
                  aria-hidden="true"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
                <p
                  className="text-xs font-bold tracking-widest uppercase mb-3"
                  style={{ color: "var(--sage)" }}
                >
                  Instagram Post {i + 1}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--bark-light)" }}>
                  Open the curated update from @{handle}.
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
