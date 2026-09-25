import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface SearchItem {
  label: string;
  sublabel: string;
  path: string;
}
interface SearchSection {
  section: string;
  title: string;
  items: SearchItem[];
}

export function GlobalSearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | null>(null);

  const runSearch = (value: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const query = value.trim();
      if (!query) {
        setSections([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      if (query.length > 80) {
        toast.error('Search text is too long (max 80 characters)');
        return;
      }
      setLoading(true);
      try {
        const res = await api.get<{ success: boolean; data: { sections: SearchSection[] } }>(`/search?q=${encodeURIComponent(query)}`);
        setSections(res.data.data.sections);
        setSearched(true);
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Search failed'));
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);

  return (
    <div>
      <PageHeader
        title="Global Search"
        description="Search across students, teachers, classes, exams, fees and more — results are scoped to your role."
        crumbs={[{ label: 'System' }, { label: 'Global Search' }]}
      />

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-9"
          placeholder="Search by name, admission number, employee ID, class, subject, exam, receipt number…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            runSearch(e.target.value);
          }}
        />
      </div>

      <div className="mt-4">
        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        )}

        {!loading && searched && totalItems === 0 && (
          <Card className="mt-2">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No results for “{q.trim()}”. Try a name, ID or class.
            </CardContent>
          </Card>
        )}

        {!loading && sections.map((s) => (
          <Card key={s.section} className="mb-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {s.title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{s.items.length} result{s.items.length === 1 ? '' : 's'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {s.items.map((item) => (
                <button
                  key={`${s.section}-${item.path}`}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    {item.sublabel && <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {!searched && !loading && (
        <Card className="mt-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Role-scoped results
            </CardTitle>
            <CardDescription>
              {user?.role === 'student'
                ? 'As a student you can search your own records — attendance, fees, results and assignments.'
                : 'As staff you can search records and modules based on your assigned permissions.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
