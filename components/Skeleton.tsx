import React from 'react';

type SkeletonProps = {
  className?: string;
};

/** Bloque base de skeleton. Usar con clases de tamaño (h-4 w-20, etc). */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
);

export const SkeletonCircle: React.FC<SkeletonProps> = ({ className = 'size-10' }) => (
  <div className={`animate-pulse rounded-full bg-slate-200 ${className}`} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string; lastLineWidth?: string }> = ({
  lines = 1,
  className = '',
  lastLineWidth = 'w-2/3',
}) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3.5 ${i === lines - 1 && lines > 1 ? lastLineWidth : 'w-full'}`} />
    ))}
  </div>
);

/** Tarjeta genérica: header con avatar/título + un par de líneas de texto. */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-xl bg-white p-4 shadow-sm border border-gray-100 ${className}`}>
    <div className="flex items-center gap-3 mb-3">
      <SkeletonCircle className="size-10 shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-1/2 mb-2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    <SkeletonText lines={2} />
  </div>
);

/** Tarjeta con imagen superior, para grillas de torneos/servicios. */
export const SkeletonImageCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex flex-col rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden ${className}`}>
    <Skeleton className="h-48 w-full rounded-none" />
    <div className="p-5 flex flex-col gap-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex justify-between items-center mt-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  </div>
);

/** Fila de tabla (para standings/fixture). */
export const SkeletonTableRow: React.FC<{ columns?: number; className?: string }> = ({
  columns = 5,
  className = '',
}) => (
  <tr className={className}>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="px-3 py-4">
        <Skeleton className="h-4 w-full max-w-[3rem] mx-auto" />
      </td>
    ))}
  </tr>
);
