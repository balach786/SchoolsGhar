import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, ArrowUpRight, ArrowDownLeft, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface HistoryItem {
  _id: string;
  type: 'import' | 'export';
  module: string;
  format: string;
  fileName: string;
  recordCount: number;
  totalRows: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  status: 'completed' | 'failed' | 'partial';
  filtersSummary?: string;
  performedBy?: { name: string; email: string; role: string };
  createdAt: string;
}

export function DataHistoryViewer() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'import' | 'export'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = filterType !== 'all' ? `&type=${filterType}` : '';
      const res = await api.get<{
        success: boolean;
        data: { records: HistoryItem[]; total: number; page: number; totalPages: number };
      }>(`/data-transfer/history?page=${page}&limit=15${typeParam}`);

      setItems(res.data.data.records || []);
      setTotalPages(res.data.data.totalPages || 1);
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Failed to load transfer history');
    } finally {
      setLoading(false);
    }
  }, [filterType, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-[#EEF5F3] to-white dark:from-[#053433]/30 dark:to-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-[#053433] dark:text-emerald-400 flex items-center gap-2">
              <History className="h-4 w-4 text-[#0F7E75]" />
              Transfer Audit History
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Live audit trail of all student, staff, fee, and academic data sheets exported or imported.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border/80 p-0.5 bg-background text-xs font-medium">
              <button
                type="button"
                onClick={() => { setFilterType('all'); setPage(1); }}
                className={`px-2.5 py-1 rounded-md transition-all ${filterType === 'all' ? 'bg-[#0F7E75] text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All Transfers
              </button>
              <button
                type="button"
                onClick={() => { setFilterType('import'); setPage(1); }}
                className={`px-2.5 py-1 rounded-md transition-all ${filterType === 'import' ? 'bg-[#0F7E75] text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Imports
              </button>
              <button
                type="button"
                onClick={() => { setFilterType('export'); setPage(1); }}
                className={`px-2.5 py-1 rounded-md transition-all ${filterType === 'export' ? 'bg-[#0F7E75] text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Exports
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={fetchHistory}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-xs">
            No import or export history recorded yet for this school.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30 text-xs">
                <TableRow>
                  <TableHead className="w-32">Date & Time</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-28">Module</TableHead>
                  <TableHead>File Name & Summary</TableHead>
                  <TableHead className="w-28 text-center">Records</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-36">Performed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {items.map((item) => (
                  <TableRow key={item._id} className="hover:bg-muted/20">
                    <TableCell className="text-muted-foreground font-mono">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      {item.type === 'import' ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 text-[10px] px-2 py-0.5">
                          <ArrowDownLeft className="mr-1 h-3 w-3" /> Import
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 text-[10px] px-2 py-0.5">
                          <ArrowUpRight className="mr-1 h-3 w-3" /> Export
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize font-medium text-foreground">
                      {item.module}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-[#0F7E75] shrink-0" />
                        <span className="truncate max-w-[280px]" title={item.fileName}>
                          {item.fileName}
                        </span>
                      </div>
                      {item.filtersSummary && (
                        <p className="text-[11px] text-muted-foreground truncate max-w-[340px] mt-0.5">
                          {item.filtersSummary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {item.type === 'import' ? (
                        <span>
                          <span className="text-emerald-600 font-bold">{item.successCount}</span>
                          {item.failedCount > 0 && <span className="text-rose-500 font-medium"> / {item.failedCount} err</span>}
                        </span>
                      ) : (
                        <span className="font-semibold text-foreground">{item.recordCount}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'completed' ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 text-[10px] px-1.5 py-0">
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> OK
                        </Badge>
                      ) : item.status === 'partial' ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 text-[10px] px-1.5 py-0">
                          <AlertTriangle className="mr-1 h-2.5 w-2.5" /> Partial
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 text-[10px] px-1.5 py-0">
                          <XCircle className="mr-1 h-2.5 w-2.5" /> Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate">
                      {item.performedBy?.name || 'Staff User'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-lg"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-lg"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
