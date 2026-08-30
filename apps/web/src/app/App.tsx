import { TooltipProvider } from '@/shared/ui/tooltip';
import { DashboardPage } from '@/pages/dashboard/ui/DashboardPage';
import { QueryProvider } from './providers/QueryProvider';

export function App() {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={200}>
        <DashboardPage />
      </TooltipProvider>
    </QueryProvider>
  );
}
