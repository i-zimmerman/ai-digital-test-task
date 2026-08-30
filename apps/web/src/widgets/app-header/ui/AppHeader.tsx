import { ThemeToggle } from '@/features/toggle-theme/ui/ThemeToggle';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1560px] items-center gap-3 px-6 md:px-10">
        <span
          aria-hidden
          className="flex h-6 items-end gap-[3px] rounded-[3px]"
          title="Review Signal"
        >
          <span className="h-2.5 w-1 rounded-sm bg-sev-medium" />
          <span className="h-4 w-1 rounded-sm bg-sev-medium" />
          <span className="h-6 w-1 rounded-sm bg-sev-critical" />
        </span>

        <span className="font-semibold tracking-tight">Review Signal</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          customer feedback, sorted by what is actually hurting
        </span>

        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
