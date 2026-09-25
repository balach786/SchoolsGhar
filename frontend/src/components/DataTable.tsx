import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  pagination?: PaginationState;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  pagination,
  onPageChange,
  onLimitChange,
  rowKey,
  onRowClick,
  compact = false,
}: DataTableProps<T>) {
  const pageNumbers = useMemo(() => {
    if (!pagination || pagination.totalPages <= 7) {
      return Array.from({ length: pagination?.totalPages ?? 0 }, (_, i) => i + 1);
    }
    const { page, totalPages } = pagination;
    const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  return (
    <div>
      <div className="overflow-x-auto thin-scroll rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-[0_4px_14px_-2px_rgba(37,99,235,0.1)]">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-[#E0EDFF]/50 hover:bg-[#E0EDFF]/50 border-b border-[#BFDBFE]">
              {columns.map((col) => (
                <TableHead key={col.key} className={col.headerClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, r) => (
                <TableRow key={r}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={cn(onRowClick && 'cursor-pointer')}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(row); } } : undefined}
                  onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest('button,a,input,[role="menuitem"]')) onRowClick(row); } : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn(compact && 'py-2', col.className)}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
          </p>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
            <Button aria-label="First page"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button aria-label="Previous page"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers.map((p, i) => (
              <span key={p} className="flex items-center">
                {i > 0 && pageNumbers[i - 1] !== p - 1 && <span className="px-1 text-muted-foreground">…</span>}
                <Button
                  variant={p === pagination.page ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onPageChange?.(p)}
                >
                  {p}
                </Button>
              </span>
            ))}
            <Button aria-label="Next page"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button aria-label="Last page"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange?.(pagination.totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
            {onLimitChange && (
              <select
                aria-label="Rows per page" className="ml-2 h-8 rounded-md border border-input bg-card px-2 text-xs"
                value={pagination.limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
              >
                {[10, 20, 50, 100].map((l) => (
                  <option key={l} value={l}>
                    {l} / page
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? 'Loading…'}
    </div>
  );
}
