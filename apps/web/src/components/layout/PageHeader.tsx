interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-fg/50 mt-1">{subtitle}</p>}
      {children}
    </div>
  );
}
