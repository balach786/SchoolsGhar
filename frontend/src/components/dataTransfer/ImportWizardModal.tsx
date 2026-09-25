import { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface RowPreview {
  rowNumber: number;
  identifier: string;
  status: 'valid' | 'warning' | 'error';
  field?: string;
  message?: string;
  data: Record<string, any>;
}

interface PreviewData {
  module: string;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  previewRows: RowPreview[];
  errors: { rowNumber: number; identifier: string; status: string; field?: string; message: string }[];
  canImport: boolean;
}

interface ImportWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string;
  moduleLabel: string;
  onSuccess?: () => void;
  additionalParams?: Record<string, string>;
}

export function ImportWizardModal({
  open,
  onOpenChange,
  module,
  moduleLabel,
  onSuccess,
  additionalParams,
}: ImportWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Preview & Review, 3: Completed
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    importedCount: number;
    skippedCount: number;
    failedCount: number;
  } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [downloadingErrors, setDownloadingErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep(1);
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setFilterTab('all');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      toast.error('Invalid file format. Please upload an Excel (.xlsx) or CSV (.csv) file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10 MB limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleStartValidation = async () => {
    if (!selectedFile) return;
    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('skipDuplicates', String(skipDuplicates));
      if (additionalParams) {
        Object.entries(additionalParams).forEach(([k, v]) => formData.append(k, v));
      }

      const res = await api.post<{ success: boolean; data: PreviewData }>(
        `/data-transfer/import/preview/${module}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );

      setPreviewData(res.data.data);
      setStep(2);
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Validation failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('skipDuplicates', String(skipDuplicates));
      if (additionalParams) {
        Object.entries(additionalParams).forEach(([k, v]) => formData.append(k, v));
      }

      const res = await api.post<{
        success: boolean;
        data: { totalRows: number; importedCount: number; skippedCount: number; failedCount: number };
      }>(`/data-transfer/import/confirm/${module}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setImportResult(res.data.data);
      setStep(3);
      toast.success(`Import completed: ${res.data.data.importedCount} rows added`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Import execution failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrorSheet = async () => {
    if (!previewData?.errors || previewData.errors.length === 0) return;
    setDownloadingErrors(true);
    try {
      const response = await api.post(
        '/data-transfer/import/error-sheet',
        { errors: previewData.errors, format: 'xlsx' },
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${module}_Import_Errors.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Error report downloaded');
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Failed to download error report');
    } finally {
      setDownloadingErrors(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/data-transfer/template/${module}?format=xlsx`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${module}_Import_Template.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Failed to download template');
    }
  };

  const filteredRows = (previewData?.previewRows || []).filter((r) => {
    if (filterTab === 'all') return true;
    return r.status === filterTab;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetState();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold text-[#053433] dark:text-emerald-400 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#0F7E75]" />
                Import {moduleLabel}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Upload and validate spreadsheet data before committing to the school database.
              </DialogDescription>
            </div>
            {/* Step Indicators */}
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className={`px-2 py-0.5 rounded-full ${step >= 1 ? 'bg-[#0F7E75] text-white' : 'bg-muted text-muted-foreground'}`}>
                1. Upload
              </span>
              <span className={`px-2 py-0.5 rounded-full ${step >= 2 ? 'bg-[#0F7E75] text-white' : 'bg-muted text-muted-foreground'}`}>
                2. Preview
              </span>
              <span className={`px-2 py-0.5 rounded-full ${step === 3 ? 'bg-[#0F7E75] text-white' : 'bg-muted text-muted-foreground'}`}>
                3. Done
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div className="py-6 space-y-5">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-[#0F7E75] hover:bg-[#EEF5F3]/30 dark:hover:bg-[#053433]/20 transition-all rounded-2xl p-8 text-center cursor-pointer flex flex-col items-center justify-center gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="rounded-2xl bg-[#EEF5F3] dark:bg-[#053433] p-4 text-[#0F7E75]">
                <UploadCloud className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedFile ? selectedFile.name : 'Click to select or drag and drop spreadsheet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Excel (.xlsx) and CSV (.csv) up to 10 MB (max 5,000 rows)
                </p>
              </div>
              {selectedFile && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB selected
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex items-center space-x-2">
                <Switch
                  id="skip-dup"
                  checked={skipDuplicates}
                  onCheckedChange={setSkipDuplicates}
                />
                <Label htmlFor="skip-dup" className="text-xs cursor-pointer font-medium">
                  Skip existing records (avoid duplicate errors)
                </Label>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-[#0F7E75] hover:text-[#0C9C8F] hover:bg-transparent"
                onClick={handleDownloadTemplate}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Need the blank template?
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & ROW REVIEW */}
        {step === 2 && previewData && (
          <div className="py-3 space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Summary metrics bar */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-3 rounded-xl bg-muted/40 border">
                <p className="text-[11px] font-medium uppercase text-muted-foreground">Total Rows</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{previewData.totalRows}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[11px] font-medium uppercase text-emerald-600 dark:text-emerald-400">Valid</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{previewData.validCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-[11px] font-medium uppercase text-amber-600 dark:text-amber-400">Warnings</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{previewData.warningCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-[11px] font-medium uppercase text-rose-600 dark:text-rose-400">Errors</p>
                <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{previewData.errorCount}</p>
              </div>
            </div>

            {/* Filter Tabs & Error download */}
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${filterTab === 'all' ? 'bg-[#0F7E75] text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  All ({previewData.previewRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('valid')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${filterTab === 'valid' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Valid ({previewData.validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('warning')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${filterTab === 'warning' ? 'bg-amber-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Warnings ({previewData.warningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('error')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${filterTab === 'error' ? 'bg-rose-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Errors ({previewData.errorCount})
                </button>
              </div>

              {previewData.errorCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg"
                  onClick={handleDownloadErrorSheet}
                  disabled={downloadingErrors}
                >
                  {downloadingErrors ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
                  Download Error Sheet ({previewData.errorCount})
                </Button>
              )}
            </div>

            {/* Table of Rows */}
            <div className="flex-1 overflow-auto border rounded-xl max-h-[36vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-background text-xs">
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead className="w-44">Identifier</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Details / Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No rows match the selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="font-mono text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="font-medium text-foreground">{r.identifier}</TableCell>
                        <TableCell>
                          {r.status === 'valid' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 text-[10px] px-1.5 py-0">
                              <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Valid
                            </Badge>
                          ) : r.status === 'warning' ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 text-[10px] px-1.5 py-0">
                              <AlertTriangle className="mr-1 h-2.5 w-2.5" /> Warning
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 text-[10px] px-1.5 py-0">
                              <XCircle className="mr-1 h-2.5 w-2.5" /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.message || 'Row is structurally and logically valid.'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* STEP 3: COMPLETED */}
        {step === 3 && importResult && (
          <div className="py-8 text-center space-y-4">
            <div className="inline-flex rounded-full bg-emerald-500/10 p-4 text-emerald-500">
              <FileCheck className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Import Process Completed</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Data was processed and stored safely under your school tenant account.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
              <div className="p-3 rounded-xl bg-muted/40 border">
                <p className="text-[11px] uppercase text-muted-foreground font-medium">Processed</p>
                <p className="text-lg font-bold mt-0.5">{importResult.totalRows}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <p className="text-[11px] uppercase font-medium">Imported</p>
                <p className="text-lg font-bold mt-0.5">{importResult.importedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <p className="text-[11px] uppercase font-medium">Skipped</p>
                <p className="text-lg font-bold mt-0.5">{importResult.skippedCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <DialogFooter className="border-t border-border/60 pt-3 flex flex-wrap items-center justify-between gap-2">
          {step === 1 && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || previewing}
                onClick={handleStartValidation}
                className="bg-[#0F7E75] hover:bg-[#0C9C8F] text-white rounded-xl shadow-xs"
              >
                {previewing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Validate & Preview <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {step === 2 && previewData && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="rounded-xl"
                disabled={importing}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Re-upload File
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={previewData.validCount === 0 || importing}
                onClick={handleExecuteImport}
                className="bg-[#0F7E75] hover:bg-[#0C9C8F] text-white rounded-xl shadow-xs"
              >
                {importing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Import {previewData.validCount} Valid Row{previewData.validCount === 1 ? '' : 's'}
              </Button>
            </>
          )}

          {step === 3 && (
            <div className="w-full flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="bg-[#0F7E75] hover:bg-[#0C9C8F] text-white rounded-xl shadow-xs"
              >
                Done
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
