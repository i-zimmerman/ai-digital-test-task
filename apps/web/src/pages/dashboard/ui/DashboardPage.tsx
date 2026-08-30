import type { IssueCategory } from '@rs/contracts';
import { useState } from 'react';
import { useTopIssues } from '@/entities/issue/api/queries';
import { useProducts } from '@/entities/product/api/queries';
import { IssueFilters } from '@/features/filter-issues/ui/IssueFilters';
import { useIssueFilters } from '@/features/filter-issues/model/use-issue-filters';
import { AppHeader } from '@/widgets/app-header/ui/AppHeader';
import { ExcludedSheet } from '@/widgets/excluded-sheet/ui/ExcludedSheet';
import { IssueSheet } from '@/widgets/issue-sheet/ui/IssueSheet';
import { StatsHeader } from '@/widgets/stats-header/ui/StatsHeader';
import { TopIssuesTable } from '@/widgets/top-issues-table/ui/TopIssuesTable';

export function DashboardPage() {
  const { state, set, reset, params, activeCount } = useIssueFilters();
  const [selected, setSelected] = useState<IssueCategory | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const { data: products } = useProducts();
  const { data: issues } = useTopIssues(params);

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />

      <main className="mx-auto max-w-[1560px] space-y-6 px-6 py-8 md:px-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            What customers are complaining about
          </h1>
          <p className="text-muted-foreground">
            Ranked by how many people raised it. Open a row to read the reviews behind
            the number.
          </p>
        </div>

        <StatsHeader onShowExcluded={() => setShowExcluded(true)} />

        <div className="space-y-3">
          <IssueFilters
            state={state}
            products={products ?? []}
            activeCount={activeCount}
            resultCount={issues?.length}
            onChange={set}
            onReset={reset}
          />

          <TopIssuesTable params={params} onSelect={setSelected} />
        </div>
      </main>

      <IssueSheet category={selected} params={params} onClose={() => setSelected(null)} />
      <ExcludedSheet isOpen={showExcluded} onClose={() => setShowExcluded(false)} />
    </div>
  );
}
