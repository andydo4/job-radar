export default function JobsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading jobs">
      {/* Top benchmark / status banner skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-brand/30 bg-brand-softer/50 px-3.5 py-2 font-mono text-[11px] text-subtle">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping bg-brand opacity-75" />
            <span className="relative inline-flex size-2 bg-brand" />
          </span>
          <span className="font-semibold text-heading">Loading Jobs:</span>
          <span className="font-semibold text-link">Querying database...</span>
          <span className="hidden sm:inline">· 1,400+ live roles across 60+ companies</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 animate-spin border border-brand border-t-transparent inline-block" />
          <span className="text-body">Scanning...</span>
        </div>
      </div>

      {/* Header skeleton */}
      <header className="flex flex-col gap-2">
        <div className="h-3.5 w-12 bg-muted" />
        <div className="h-8 w-44 bg-muted" />
        <div className="h-4 w-96 max-w-full bg-muted" />
      </header>

      {/* Nav tabs & mode switch skeleton */}
      <div className="flex flex-col gap-4 border-y border-line py-4">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-5 gap-1 sm:flex sm:gap-2">
            <div className="h-9 w-20 bg-muted" />
            <div className="h-9 w-20 bg-muted" />
            <div className="h-9 w-16 bg-muted" />
            <div className="h-9 w-16 bg-muted" />
            <div className="h-9 w-16 bg-muted" />
          </div>
          <div className="h-8 w-28 bg-muted" />
        </div>

        {/* Quick filter chips skeleton */}
        <div className="flex flex-wrap gap-2">
          <div className="h-8 w-36 bg-muted" />
          <div className="h-8 w-28 bg-muted" />
          <div className="h-8 w-32 bg-muted" />
          <div className="h-8 w-24 bg-muted" />
        </div>
      </div>

      {/* Cards list skeleton */}
      <section aria-label="Loading job listings" className="@container border border-line bg-surface">
        <ul className="divide-y divide-line">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="min-w-0 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between @2xl:gap-6">
                <div className="min-w-0 flex-1 flex flex-col gap-2.5">
                  {/* Company and time */}
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-28 bg-muted" />
                    <span className="text-subtle font-mono text-xs">·</span>
                    <div className="h-3.5 w-20 bg-muted" />
                  </div>
                  {/* Job title */}
                  <div
                    className="h-5 bg-muted"
                    style={{ width: `${Math.max(45, (i * 17) % 50 + 40)}%` }}
                  />
                  {/* Metadata pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <div className="h-5 w-16 bg-muted" />
                    <div className="h-5 w-20 bg-muted" />
                    <div className="h-5 w-24 bg-muted" />
                    <div className="h-5 w-28 bg-muted" />
                  </div>
                </div>

                {/* Actions: Apply, Save, Applied, Hide */}
                <div className="flex flex-wrap items-center gap-2 @2xl:justify-end">
                  <div className="h-10 w-20 bg-muted" />
                  <div className="h-9 w-16 bg-muted" />
                  <div className="h-9 w-20 bg-muted" />
                  <div className="h-9 w-14 bg-muted" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
