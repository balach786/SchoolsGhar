export function FilterToolbar({ children }: { children: React.ReactNode }) {
  return <div className="filter-toolbar" role="search" aria-label="Filter records">{children}</div>;
}
