import { Skeleton } from '@/shared/ui/skeleton';

export function CustomerSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
      <Skeleton className="h-60" />
      <Skeleton className="h-40" />
      <Skeleton className="h-80" />
    </div>
  );
}
