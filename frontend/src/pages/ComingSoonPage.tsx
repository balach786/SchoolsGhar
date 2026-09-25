import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

interface ComingSoonPageProps {
  title: string;
  phase: string;
  description?: string;
}

export function ComingSoonPage({ title, phase, description }: ComingSoonPageProps) {
  return (
    <div>
      <PageHeader title={title} crumbs={[{ label: title }]} />
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{title} module</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description ??
              `This module is delivered in ${phase} of the build. It will operate on real MongoDB data end-to-end — no mock screens.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
