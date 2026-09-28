export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-neutral-800/50 rounded-lg animate-pulse ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="apple-glass-card p-4 rounded-2xl space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="apple-glass-card p-6 rounded-2xl space-y-4">
      <Skeleton className="h-6 w-1/4" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
