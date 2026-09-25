import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, School } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, type ApiListResponse } from '@/lib/api';

interface SettingsData {
  schoolCode?: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  principalName: string | null;
  activeSessionId: string | null;
  currency: string;
  receiptPrefix: string;
  receiptSettings: { showLogo: boolean; showAddress: boolean; showPhone: boolean; signatureLabel: string; footerText: string | null };
  resultCardSettings: { showLogo: boolean; showPosition: boolean; showGrade: boolean; signatureLabel: string; footerText: string | null };
  themeSettings: { accentColor: string | null; compactSidebar: boolean };
  updatedAt?: string;
}

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
  isArchived?: boolean;
}

interface ProfileForm {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  principalName: string;
  schoolLogoUrl: string;
  currency: string;
  receiptPrefix: string;
  activeSessionId: string;
}

const NULLABLE = (v: string) => (v.trim() === '' ? null : v.trim());

export function SettingsPage() {
  const { can } = useAuth();
  const canEdit = can('schoolSettings', 'edit');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    schoolName: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    principalName: '',
    schoolLogoUrl: '',
    currency: 'PKR',
    receiptPrefix: 'RCPT',
    activeSessionId: 'none',
  });
  const [receipt, setReceipt] = useState<SettingsData['receiptSettings']>({
    showLogo: true,
    showAddress: true,
    showPhone: true,
    signatureLabel: 'Authorized Signatory',
    footerText: null,
  });
  const [resultCard, setResultCard] = useState<SettingsData['resultCardSettings']>({
    showLogo: true,
    showPosition: true,
    showGrade: true,
    signatureLabel: 'Class Teacher',
    footerText: null,
  });
  const [theme, setTheme] = useState<SettingsData['themeSettings']>({ accentColor: null, compactSidebar: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, sessRes] = await Promise.all([
        api.get<{ success: boolean; data: SettingsData }>('/school-settings'),
        api.get<ApiListResponse<SessionRow>>('/academic-sessions/lookup'),
      ]);
      setSettings(sRes.data.data);
      setSessions(sessRes.data.data.filter((s) => !s.isArchived));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sync editable copies once settings arrive.
  useEffect(() => {
    if (!settings) return;
    setProfile({
      schoolName: settings.schoolName,
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      website: settings.website ?? '',
      principalName: settings.principalName ?? '',
      schoolLogoUrl: settings.schoolLogoUrl ?? '',
      currency: settings.currency,
      receiptPrefix: settings.receiptPrefix,
      activeSessionId: settings.activeSessionId ?? 'none',
    });
    setReceipt(settings.receiptSettings);
    setResultCard(settings.resultCardSettings);
    setTheme(settings.themeSettings);
  }, [settings]);

  const save = async (patch: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await api.patch<{ success: boolean; data: SettingsData }>('/school-settings', patch);
      setSettings(res.data.data);
      window.dispatchEvent(new Event('schoolSettingsUpdated'));
      toast.success(successMsg);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save settings'));
    } finally {
      setBusy(false);
    }
  };

  const profileInput = (key: keyof Omit<ProfileForm, 'activeSessionId'>) => ({
    value: profile[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, [key]: e.target.value }),
  });

  const handleSaveProfile = () => {
    if (profile.phone?.trim()) {
      const phoneRegex = /^((\+92)|(0092)|92|0)?(3[0-9]{2}[\s\-]?\d{7}|[2456789][0-9]{1,2}[\s\-]?\d{7,8})$/;
      if (!phoneRegex.test(profile.phone.trim())) {
        return toast.error("Invalid Pakistani phone number format. Use valid mobile (e.g. 03001234567) or PTCL/landline code.");
      }
    }
    if (profile.website?.trim()) {
      try {
        const url = new URL(profile.website.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('Invalid protocol');
        }
      } catch (e) {
        return toast.error("Invalid website URL. Must include http:// or https://");
      }
    }

    save(
      {
        schoolName: profile.schoolName.trim(),
        schoolLogoUrl: NULLABLE(profile.schoolLogoUrl),
        address: NULLABLE(profile.address),
        phone: NULLABLE(profile.phone),
        email: NULLABLE(profile.email),
        website: NULLABLE(profile.website),
        principalName: NULLABLE(profile.principalName),
        currency: profile.currency.trim(),
        receiptPrefix: profile.receiptPrefix.trim(),
        activeSessionId: profile.activeSessionId === 'none' ? null : profile.activeSessionId,
      },
      'School profile updated'
    );
  };

  if (loading || !settings) {
    return (
      <div>
        <PageHeader title="Settings" description="School profile, branding and document preferences." crumbs={[{ label: 'System' }, { label: 'Settings' }]} />
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading school settings…
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="School profile, branding, receipts, result cards and theme preferences."
        crumbs={[{ label: 'System' }, { label: 'Settings' }]}
        actions={!canEdit ? <Badge variant="muted">Read-only for your role</Badge> : undefined}
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">School profile</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="result-cards">Result cards</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <School className="h-4 w-4 text-primary" /> School identity
              </CardTitle>
              <CardDescription>
                The active academic session is used as the default across the system. Switching it never overwrites historical records.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <Label htmlFor="st-code">School code (Login ID)</Label>
                <Input id="st-code" disabled value={settings.schoolCode || ''} />
                <p className="text-[0.8rem] text-muted-foreground mt-1">Used by all staff to login.</p>
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="st-name">School name</Label>
                <Input id="st-name" disabled={!canEdit} {...profileInput('schoolName')} />
              </div>
              <div>
                <Label htmlFor="st-address">Address</Label>
                <Input id="st-address" disabled={!canEdit} {...profileInput('address')} />
              </div>
              <div>
                <Label htmlFor="st-phone">Phone</Label>
                <Input id="st-phone" disabled={!canEdit} {...profileInput('phone')} />
              </div>
              <div>
                <Label htmlFor="st-email">Email</Label>
                <Input id="st-email" disabled={!canEdit} {...profileInput('email')} />
              </div>
              <div>
                <Label htmlFor="st-website">Website</Label>
                <Input id="st-website" disabled={!canEdit} {...profileInput('website')} />
              </div>
              <div>
                <Label htmlFor="st-principal">Principal name</Label>
                <Input id="st-principal" disabled={!canEdit} {...profileInput('principalName')} />
              </div>
              <div>
                <Label htmlFor="st-logo">Logo URL</Label>
                <p className="text-xs text-muted-foreground mb-2">Must be a direct image link (e.g. .png, .jpg), not a Google Drive/share page.</p>
                <Input id="st-logo" disabled={!canEdit} {...profileInput('schoolLogoUrl')} placeholder="https://…/logo.png" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="st-currency">Currency</Label>
                  <Input id="st-currency" disabled={!canEdit} {...profileInput('currency')} />
                </div>
                <div>
                  <Label htmlFor="st-prefix">Receipt prefix</Label>
                  <Input id="st-prefix" disabled={!canEdit} {...profileInput('receiptPrefix')} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Active academic session</Label>
                <Select disabled={!canEdit} value={profile.activeSessionId} onValueChange={(v) => setProfile({ ...profile, activeSessionId: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None selected</SelectItem>
                    {sessions.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                        {s.isActive ? ' (currently active)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canEdit && (
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={busy || !profile.schoolName.trim()}
                  >
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save profile
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipt preferences</CardTitle>
              <CardDescription>What appears on printed fee receipts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={receipt.showLogo} onCheckedChange={(v) => setReceipt({ ...receipt, showLogo: v })} />
                  Show logo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={receipt.showAddress} onCheckedChange={(v) => setReceipt({ ...receipt, showAddress: v })} />
                  Show address
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={receipt.showPhone} onCheckedChange={(v) => setReceipt({ ...receipt, showPhone: v })} />
                  Show phone
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rc-sig">Signature label</Label>
                  <Input id="rc-sig" disabled={!canEdit} value={receipt.signatureLabel} onChange={(e) => setReceipt({ ...receipt, signatureLabel: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="rc-footer">Footer text</Label>
                  <Input id="rc-footer" disabled={!canEdit} value={receipt.footerText ?? ''} onChange={(e) => setReceipt({ ...receipt, footerText: e.target.value })} />
                </div>
              </div>
              {canEdit && (
                <div className="flex justify-end">
                  <Button onClick={() => save({ receiptSettings: { ...receipt, footerText: NULLABLE(receipt.footerText ?? '') } }, 'Receipt preferences updated')} disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save receipts
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result-cards" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Result card preferences</CardTitle>
              <CardDescription>What appears on printed result cards. Grades come from configurable grade boundaries — never GPA.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={resultCard.showLogo} onCheckedChange={(v) => setResultCard({ ...resultCard, showLogo: v })} />
                  Show logo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={resultCard.showPosition} onCheckedChange={(v) => setResultCard({ ...resultCard, showPosition: v })} />
                  Show position
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch disabled={!canEdit} checked={resultCard.showGrade} onCheckedChange={(v) => setResultCard({ ...resultCard, showGrade: v })} />
                  Show grade
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rs-sig">Signature label</Label>
                  <Input id="rs-sig" disabled={!canEdit} value={resultCard.signatureLabel} onChange={(e) => setResultCard({ ...resultCard, signatureLabel: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="rs-footer">Footer text</Label>
                  <Input id="rs-footer" disabled={!canEdit} value={resultCard.footerText ?? ''} onChange={(e) => setResultCard({ ...resultCard, footerText: e.target.value })} />
                </div>
              </div>
              {canEdit && (
                <div className="flex justify-end">
                  <Button onClick={() => save({ resultCardSettings: { ...resultCard, footerText: NULLABLE(resultCard.footerText ?? '') } }, 'Result card preferences updated')} disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save result cards
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="theme" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme preferences</CardTitle>
              <CardDescription>Accent color and sidebar density.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="th-accent">Accent color (CSS color)</Label>
                  <Input id="th-accent" disabled={!canEdit} value={theme.accentColor ?? ''} placeholder="#0f766e" onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} />
                </div>
                <label className="flex items-end gap-2 pb-1.5 text-sm">
                  <Switch disabled={!canEdit} checked={theme.compactSidebar} onCheckedChange={(v) => setTheme({ ...theme, compactSidebar: v })} />
                  Compact sidebar
                </label>
              </div>
              {canEdit && (
                <div className="flex justify-end">
                  <Button onClick={() => save({ themeSettings: { ...theme, accentColor: NULLABLE(theme.accentColor ?? '') } }, 'Theme preferences updated')} disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save theme
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
