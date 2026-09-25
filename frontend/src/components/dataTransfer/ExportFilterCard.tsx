import { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, BookmarkPlus, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface FilterField {
  id: string;
  label: string;
  type: 'select' | 'text' | 'date';
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
}

interface ExportFilterCardProps {
  title: string;
  description: string;
  module: string;
  fields?: FilterField[];
  defaultFormat?: 'xlsx' | 'csv';
  onTemplateDownload?: (format: 'xlsx' | 'csv') => void;
  showTemplateButton?: boolean;
}

export function ExportFilterCard({
  title,
  description,
  module,
  fields = [],
  defaultFormat = 'xlsx',
  onTemplateDownload,
  showTemplateButton = true,
}: ExportFilterCardProps) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<'xlsx' | 'csv'>(defaultFormat);
  const [exporting, setExporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  useEffect(() => {
    const defaults: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.defaultValue) defaults[f.id] = f.defaultValue;
    });
    setFilterValues(defaults);
  }, [fields]);

  const handleFieldChange = (id: string, val: string) => {
    setFilterValues((prev) => ({ ...prev, [id]: val }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      Object.entries(filterValues).forEach(([k, v]) => {
        if (v && v !== 'all') params.append(k, v);
      });

      const response = await api.get(`/data-transfer/export/${module}?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from header or fallback
      const disposition = response.headers['content-disposition'];
      let filename = `${module}_export.${format}`;
      if (disposition && disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/["']/g, '');
      }
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Successfully exported ${filename}`);
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (onTemplateDownload) {
      onTemplateDownload(format);
      return;
    }
    setDownloadingTemplate(true);
    try {
      const response = await api.get(`/data-transfer/template/${module}?format=${format}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${module}_Import_Template.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Import template downloaded');
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-[#EEF5F3] to-white dark:from-[#053433]/30 dark:to-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold text-[#053433] dark:text-emerald-400 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#0F7E75]" />
              {title}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Format:</span>
            <div className="inline-flex rounded-lg border border-border/80 p-0.5 bg-background">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  format === 'xlsx'
                    ? 'bg-[#0F7E75] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  format === 'csv'
                    ? 'bg-[#0F7E75] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                CSV (.csv)
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {fields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {fields.map((field) => (
              <div key={field.id} className="space-y-1">
                <Label htmlFor={field.id} className="text-xs font-medium text-foreground">
                  {field.label}
                </Label>
                {field.type === 'select' ? (
                  <Select
                    value={filterValues[field.id] || 'all'}
                    onValueChange={(val) => handleFieldChange(field.id, val)}
                  >
                    <SelectTrigger id={field.id} className="h-9 text-xs bg-card rounded-xl">
                      <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {field.label}s</SelectItem>
                      {(field.options || []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === 'date' ? (
                  <Input
                    id={field.id}
                    type="date"
                    className="h-9 text-xs rounded-xl bg-card"
                    value={filterValues[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  />
                ) : (
                  <Input
                    id={field.id}
                    type="text"
                    placeholder={field.placeholder}
                    className="h-9 text-xs rounded-xl bg-card"
                    value={filterValues[field.id] || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
          <div className="flex items-center gap-2">
            {showTemplateButton && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
              >
                {downloadingTemplate ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5 text-[#0F7E75]" />
                )}
                Download Template
              </Button>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="h-8 bg-[#0F7E75] hover:bg-[#0C9C8F] text-white rounded-xl shadow-xs text-xs font-medium"
          >
            {exporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export {format.toUpperCase()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
