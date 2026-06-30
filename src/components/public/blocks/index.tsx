import type { PageSectionConfig } from "@/lib/types";
import { validateBlockProps, BLOCK_PREFIX } from "@/lib/blocks/registry";

/**
 * The block renderer — maps a registered block `type` to a component, fed
 * validated/coerced props. Pure + server-safe so it renders both the dashboard
 * preview and (shipped to the starter) the live client site. Styling is neutral
 * and light-site-friendly; the client's theme refines it later.
 */

const ALIGN: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
const s = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const n = (v: unknown, fallback: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const b = (v: unknown) => v === true || v === "true";

function HeadingBlock(p: Record<string, unknown>) {
  const level = Math.min(6, Math.max(1, n(p.level, 2)));
  const Tag = (`h${level}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const sizes: Record<number, string> = {
    1: "text-4xl sm:text-5xl",
    2: "text-3xl sm:text-4xl",
    3: "text-2xl sm:text-3xl",
    4: "text-xl sm:text-2xl",
    5: "text-lg sm:text-xl",
    6: "text-base sm:text-lg",
  };
  return (
    <Tag className={`font-semibold tracking-tight text-gray-900 ${sizes[level]} ${ALIGN[s(p.align, "left")] ?? ""}`}>
      {s(p.text, "Your heading")}
    </Tag>
  );
}

function TextBlock(p: Record<string, unknown>) {
  return (
    <p className={`max-w-2xl text-[15px] leading-relaxed text-gray-600 ${ALIGN[s(p.align, "left")] ?? ""} ${s(p.align) === "center" ? "mx-auto" : ""}`}>
      {s(p.text)}
    </p>
  );
}

function ImageBlock(p: Record<string, unknown>) {
  const src = s(p.src);
  if (!src) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
        No image set
      </div>
    );
  }
  // Plain <img> on purpose — this renderer also ships to the standalone client
  // repo, where next/image config can't be assumed.
  return <img src={src} alt={s(p.alt)} className={`w-full object-cover ${b(p.rounded) ? "rounded-xl" : ""}`} />;
}

function alignWrap(align: string): string {
  if (align === "center") return "justify-center";
  if (align === "right") return "justify-end";
  return "justify-start";
}

function ButtonBlock(p: Record<string, unknown>) {
  const primary = s(p.style, "primary") !== "secondary";
  return (
    <div className={`flex ${alignWrap(s(p.align, "left"))}`}>
      <a
        href={s(p.href, "#")}
        className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 text-[14px] font-medium transition-colors ${
          primary
            ? "bg-gray-900 text-white hover:bg-gray-800"
            : "border border-gray-300 text-gray-900 hover:bg-gray-50"
        }`}
      >
        {s(p.label, "Get started")}
      </a>
    </div>
  );
}

function HeroBlock(p: Record<string, unknown>) {
  const align = s(p.align, "center");
  const img = s(p.imageSrc);
  return (
    <section
      className={`relative overflow-hidden rounded-2xl px-6 py-16 sm:px-10 sm:py-24 ${img ? "text-white" : "bg-gray-50 text-gray-900"} ${ALIGN[align] ?? "text-center"}`}
      style={img ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url(${img})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <div className={`mx-auto max-w-2xl ${align === "left" ? "ml-0" : align === "right" ? "mr-0 ml-auto" : ""}`}>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{s(p.heading)}</h1>
        {s(p.subheading) && <p className={`mt-4 text-[16px] leading-relaxed ${img ? "text-white/85" : "text-gray-600"}`}>{s(p.subheading)}</p>}
        {s(p.ctaLabel) && (
          <div className={`mt-6 flex ${alignWrap(align)}`}>
            <a href={s(p.ctaHref, "#")} className="inline-flex min-h-[44px] items-center rounded-lg bg-gray-900 px-6 text-[15px] font-medium text-white transition-colors hover:bg-gray-800">
              {s(p.ctaLabel)}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function CtaBlock(p: Record<string, unknown>) {
  const tone = s(p.tone, "accent");
  const toneClass =
    tone === "dark" ? "bg-gray-900 text-white" : tone === "light" ? "bg-gray-50 text-gray-900" : "bg-gray-900 text-white";
  return (
    <section className={`rounded-2xl px-6 py-12 text-center sm:px-10 ${toneClass}`}>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s(p.heading)}</h2>
      {s(p.text) && <p className={`mx-auto mt-3 max-w-xl text-[15px] leading-relaxed ${tone === "light" ? "text-gray-600" : "text-white/85"}`}>{s(p.text)}</p>}
      {s(p.buttonLabel) && (
        <a
          href={s(p.buttonHref, "#")}
          className={`mt-6 inline-flex min-h-[44px] items-center rounded-lg px-6 text-[15px] font-medium transition-colors ${tone === "light" ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-white text-gray-900 hover:bg-white/90"}`}
        >
          {s(p.buttonLabel)}
        </a>
      )}
    </section>
  );
}

function ColumnsBlock(p: Record<string, unknown>) {
  const count = Math.min(3, Math.max(2, n(p.count, 3)));
  const cols = [
    { title: s(p.col1Title), text: s(p.col1Text) },
    { title: s(p.col2Title), text: s(p.col2Text) },
    { title: s(p.col3Title), text: s(p.col3Text) },
  ].slice(0, count);
  return (
    <div className={`grid gap-6 ${count === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {cols.map((c, i) => (
        <div key={i}>
          {c.title && <h3 className="text-[17px] font-semibold text-gray-900">{c.title}</h3>}
          {c.text && <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">{c.text}</p>}
        </div>
      ))}
    </div>
  );
}

function DividerBlock(p: Record<string, unknown>) {
  const spacing: Record<string, string> = { tight: "my-3", normal: "my-6", loose: "my-12" };
  return <hr className={`border-gray-200 ${spacing[s(p.spacing, "normal")] ?? "my-6"}`} />;
}

function SpacerBlock(p: Record<string, unknown>) {
  const size: Record<string, string> = { small: "h-6", medium: "h-12", large: "h-24" };
  return <div className={size[s(p.size, "medium")] ?? "h-12"} aria-hidden />;
}

function embedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return "";
}

function VideoBlock(p: Record<string, unknown>) {
  const src = embedUrl(s(p.url));
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
        Paste a YouTube or Vimeo link
      </div>
    );
  }
  return (
    <figure>
      <div className="aspect-video w-full overflow-hidden rounded-xl">
        <iframe src={src} className="h-full w-full" allowFullScreen title={s(p.caption, "Video")} />
      </div>
      {s(p.caption) && <figcaption className="mt-2 text-center text-[13px] text-gray-500">{s(p.caption)}</figcaption>}
    </figure>
  );
}

function QuoteBlock(p: Record<string, unknown>) {
  return (
    <figure className="mx-auto max-w-2xl text-center">
      <blockquote className="text-xl font-medium leading-relaxed text-gray-900 sm:text-2xl">&ldquo;{s(p.text)}&rdquo;</blockquote>
      {(s(p.author) || s(p.role)) && (
        <figcaption className="mt-4 text-[14px] text-gray-500">
          <span className="font-medium text-gray-900">{s(p.author)}</span>
          {s(p.role) && <span> · {s(p.role)}</span>}
        </figcaption>
      )}
    </figure>
  );
}

function GalleryBlock(p: Record<string, unknown>) {
  const imgs = [s(p.img1), s(p.img2), s(p.img3), s(p.img4)].filter(Boolean);
  if (imgs.length === 0) {
    return (
      <div className="flex aspect-[16/7] w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
        Add images to your gallery
      </div>
    );
  }
  return (
    <div className={`grid gap-3 ${imgs.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>
      {imgs.map((src, i) => (
        <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />
      ))}
    </div>
  );
}

function StatsBlock(p: Record<string, unknown>) {
  const stats = [
    { v: s(p.stat1Value), l: s(p.stat1Label) },
    { v: s(p.stat2Value), l: s(p.stat2Label) },
    { v: s(p.stat3Value), l: s(p.stat3Label) },
  ].filter((x) => x.v || x.l);
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {stats.map((x, i) => (
        <div key={i} className="text-center">
          <p className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">{x.v}</p>
          <p className="mt-1 text-[13px] text-gray-500">{x.l}</p>
        </div>
      ))}
    </div>
  );
}

function FaqBlock(p: Record<string, unknown>) {
  const items = [
    { q: s(p.q1), a: s(p.a1) },
    { q: s(p.q2), a: s(p.a2) },
    { q: s(p.q3), a: s(p.a3) },
  ].filter((x) => x.q);
  return (
    <div className="mx-auto max-w-2xl divide-y divide-gray-200">
      {items.map((x, i) => (
        <div key={i} className="py-4">
          <p className="text-[16px] font-medium text-gray-900">{x.q}</p>
          {x.a && <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">{x.a}</p>}
        </div>
      ))}
    </div>
  );
}

function LogosBlock(p: Record<string, unknown>) {
  const logos = [s(p.logo1), s(p.logo2), s(p.logo3), s(p.logo4)].filter(Boolean);
  return (
    <div className="text-center">
      {s(p.heading) && <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-gray-400">{s(p.heading)}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {logos.length === 0
          ? <span className="text-sm text-gray-400">Add logos</span>
          : logos.map((src, i) => (
              <img key={i} src={src} alt="" className="h-8 w-auto object-contain opacity-60 grayscale" />
            ))}
      </div>
    </div>
  );
}

const RENDERERS: Record<string, (p: Record<string, unknown>) => React.ReactNode> = {
  heading: HeadingBlock,
  text: TextBlock,
  image: ImageBlock,
  button: ButtonBlock,
  hero: HeroBlock,
  cta: CtaBlock,
  columns: ColumnsBlock,
  divider: DividerBlock,
  spacer: SpacerBlock,
  video: VideoBlock,
  quote: QuoteBlock,
  gallery: GalleryBlock,
  stats: StatsBlock,
  faq: FaqBlock,
  logos: LogosBlock,
};

export function BlockRenderer({ block }: { block: PageSectionConfig }) {
  // RENDERERS is keyed by the short name; the stored type is namespaced.
  const key = block.type.startsWith(BLOCK_PREFIX) ? block.type.slice(BLOCK_PREFIX.length) : block.type;
  const Render = RENDERERS[key];
  if (!Render) return null;
  return <>{Render(validateBlockProps(block.type, block.props))}</>;
}
