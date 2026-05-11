interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-[#1C1C1A]" style={{ fontFamily: "var(--font-serif)" }}>
        {title}
      </h1>
      {subtitle && <p className="text-sm text-[#1C1C1A]/60 mt-1">{subtitle}</p>}
      {children}
    </div>
  );
}
