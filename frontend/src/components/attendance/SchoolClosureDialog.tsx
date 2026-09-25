import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, CheckCircle, Trash2, Sparkles, Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

const OFFICIAL_HOLIDAY_PRESETS = [
  'Independence Day (14th August)',
  'Pakistan Day (23rd March)',
  'Kashmir Day (5th February)',
  'Eid-ul-Fitr',
  'Eid-ul-Adha',
  'Quaid-e-Azam Day (25th December)',
  'Iqbal Day (9th November)',
  'Ashura (9th & 10th Moharram)',
  'Eid Milad-un-Nabi',
  'Winter Vacation',
  'Summer Vacation',
  'Labor Day (1st May)',
  'Custom Holiday',
];

const SCHOOL_CLOSED_PRESETS = [
  'Heavy Rain / Flood Warning',
  'Smog / Extreme Air Quality Alert',
  'Severe Cold Wave / Winter Chill',
  'Extreme Heat Wave',
  'Local Strike / Law & Order Protest',
  'Election Day / Polling Station Setup',
  'School Building Maintenance & Repairs',
  'Faculty & Teacher Training Workshop',
  'Sports Gala / Annual Day Off',
  'Emergency Administrative Closure',
  'Custom Closure Reason',
];

export interface SchoolClosureItem {
  id?: string;
  _id?: string;
  dateString: string;
  type: 'official_leave' | 'school_closed';
  reason: string;
  reasonCategory?: string;
  notes?: string;
  applicableTo?: 'all' | 'students' | 'staff';
}

interface SchoolClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  existingClosure?: SchoolClosureItem | null;
  onSuccess: () => void;
}

export function SchoolClosureDialog({
  open,
  onOpenChange,
  initialDate,
  existingClosure,
  onSuccess,
}: SchoolClosureDialogProps) {
  const [dateString, setDateString] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'official_leave' | 'school_closed'>('official_leave');
  const [selectedPreset, setSelectedPreset] = useState<string>(OFFICIAL_HOLIDAY_PRESETS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [applicableTo, setApplicableTo] = useState<'all' | 'students' | 'staff'>('all');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      const activeDate = initialDate || new Date().toISOString().slice(0, 10);
      setDateString(activeDate);

      if (existingClosure) {
        setType(existingClosure.type);
        setApplicableTo(existingClosure.applicableTo || 'all');
        setNotes(existingClosure.notes || '');

        const presets = existingClosure.type === 'official_leave' ? OFFICIAL_HOLIDAY_PRESETS : SCHOOL_CLOSED_PRESETS;
        if (presets.includes(existingClosure.reason)) {
          setSelectedPreset(existingClosure.reason);
          setCustomReason('');
        } else {
          setSelectedPreset(existingClosure.type === 'official_leave' ? 'Custom Holiday' : 'Custom Closure Reason');
          setCustomReason(existingClosure.reason);
        }
      } else {
        setType('official_leave');
        setSelectedPreset(OFFICIAL_HOLIDAY_PRESETS[0]);
        setCustomReason('');
        setApplicableTo('all');
        setNotes('');
      }
    }
  }, [open, initialDate, existingClosure]);

  const handleTypeChange = (newType: 'official_leave' | 'school_closed') => {
    setType(newType);
    if (newType === 'official_leave') {
      setSelectedPreset(OFFICIAL_HOLIDAY_PRESETS[0]);
    } else {
      setSelectedPreset(SCHOOL_CLOSED_PRESETS[0]);
    }
    setCustomReason('');
  };

  const isCustom = selectedPreset === 'Custom Holiday' || selectedPreset === 'Custom Closure Reason';
  const effectiveReason = isCustom ? customReason.trim() : selectedPreset;

  const handleSave = async () => {
    if (!dateString) {
      toast.error('Please select a date');
      return;
    }
    if (!effectiveReason) {
      toast.error('Please specify a reason for this off/closed day');
      return;
    }

    setSaving(true);
    try {
      await api.post('/school-closures', {
        dateString,
        type,
        reason: effectiveReason,
        applicableTo,
        notes: notes.trim(),
      });

      toast.success(
        type === 'official_leave'
          ? `Officially leave day recorded for ${dateString}`
          : `School closure marked for ${dateString} (${effectiveReason})`
      );
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save closure'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dateString) return;
    setDeleting(true);
    try {
      await api.delete(`/school-closures/${dateString}`);
      toast.success(`Removed off/closed status for ${dateString}`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to remove closure'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-slate-200/80 shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md ${
              type === 'official_leave' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-gradient-to-br from-amber-500 to-rose-500'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
                {existingClosure ? 'Edit Holiday / School Closure' : 'Declare Holiday / School Closed'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Automatically adjusts monthly working days & prevents absent salary deductions.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date Picker */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Select Date</Label>
            <Input
              type="date"
              value={dateString}
              onChange={(e) => setDateString(e.target.value)}
              className="mt-1.5 rounded-xl border-slate-200"
            />
          </div>

          {/* Type Selector Tabs */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Day Status Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => handleTypeChange('official_leave')}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
                  type === 'official_leave'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Officially Leave Day
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('school_closed')}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
                  type === 'school_closed'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                School Closed Day
              </button>
            </div>
          </div>

          {/* Reason Selector */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">
              {type === 'official_leave' ? 'Official Holiday Reason' : 'School Closure Reason'}
            </Label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200">
                <SelectValue placeholder="Choose reason..." />
              </SelectTrigger>
              <SelectContent className="max-h-60 rounded-xl">
                {(type === 'official_leave' ? OFFICIAL_HOLIDAY_PRESETS : SCHOOL_CLOSED_PRESETS).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason input when 'Custom' selected */}
          {isCustom && (
            <div>
              <Label className="text-xs font-semibold text-slate-700">Custom Reason Description</Label>
              <Input
                placeholder="Enter specific closure/holiday reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-1.5 rounded-xl border-slate-200"
              />
            </div>
          )}

          {/* Applicable To */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Applies To</Label>
            <Select value={applicableTo} onValueChange={(v: any) => setApplicableTo(v)}>
              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200">
                <SelectValue placeholder="Who does this apply to?" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Entire Institution (Both Students & Staff)</SelectItem>
                <SelectItem value="students">Students Only</SelectItem>
                <SelectItem value="staff">Staff / Faculty Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Administrative Notes (Optional)</Label>
            <Input
              placeholder="e.g. As announced by District Commissioner / Gov notification"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 rounded-xl border-slate-200"
            />
          </div>

          {/* Auto Count Explanation Alert */}
          <div className="rounded-2xl p-3 bg-indigo-50/70 border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-900 leading-relaxed">
            <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Automatic Attendance & Payroll Protection</p>
              <p className="text-indigo-700 text-[11px] mt-0.5">
                Marking this day will automatically exclude it from mandatory working days. Staff salaries will <strong>never</strong> deduct pay for this day.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
          {existingClosure ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 gap-1.5 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Removing...' : 'Remove Off Day'}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-slate-600 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white shadow-sm text-xs font-semibold px-4"
            >
              {saving ? 'Saving...' : 'Save & Recalculate'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
