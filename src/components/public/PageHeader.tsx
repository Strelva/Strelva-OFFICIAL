interface PageHeaderProps {
  title?: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
      {title && (
        <div className="container-main">
          <h1
            className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]"
            style={{ color: "var(--bark)" }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="text-base md:text-lg leading-relaxed max-w-xl mt-4"
              style={{ color: "var(--bark-light)" }}
            >
              {description}
            </p>
          )}
        </div>
      )}
      {!title && <div />}
    </div>
  );
}
