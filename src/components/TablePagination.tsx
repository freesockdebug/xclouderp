import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface TablePaginationState<T> {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  pageItems: T[];
  setPage: (nextPage: number) => void;
  setPageSize: (nextSize: number) => void;
}

/**
 * Reusable client-side table pagination hook.
 * Automatically clamps page when filtered items shrink so tables never render an empty out-of-range page.
 */
export function useTablePagination<T>(
  items: T[],
  defaultPageSize = 20
): TablePaginationState<T> {
  const [page, setPageRaw] = useState<number>(1);
  const [pageSize, setPageSizeRaw] = useState<number>(defaultPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPageRaw(totalPages);
    } else if (page < 1) {
      setPageRaw(1);
    }
  }, [page, totalPages]);

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(totalItems, startIndex + pageSize);

  const pageItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const setPage = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, Math.floor(nextPage)), totalPages);
    setPageRaw(clamped);
  };

  const setPageSize = (nextSize: number) => {
    const safeSize = Math.max(5, Math.min(500, Math.floor(nextSize)));
    setPageSizeRaw(safeSize);
    setPageRaw(1);
  };

  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
    setPage,
    setPageSize,
  };
}

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

function buildPageRange(current: number, total: number): Array<number | 'ELLIPSIS'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const pages: Array<number | 'ELLIPSIS'> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push('ELLIPSIS');
  for (let p = left; p <= right; p++) {
    pages.push(p);
  }
  if (right < total - 1) pages.push('ELLIPSIS');
  pages.push(total);
  return pages;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100, 200],
  itemLabel = '条记录',
}) => {
  const [jumpInput, setJumpInput] = useState<string>('');
  const startNum = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endNum = Math.min(totalItems, page * pageSize);
  const pageRange = buildPageRange(page, totalPages);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(jumpInput);
    if (Number.isFinite(target) && target >= 1) {
      onPageChange(Math.min(totalPages, Math.max(1, Math.floor(target))));
      setJumpInput('');
    }
  };

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
        <span>
          共 <strong className="text-slate-900 dark:text-white">{totalItems.toLocaleString()}</strong> {itemLabel}
        </span>
        {totalItems > 0 && (
          <span className="text-[11px] text-slate-500">
            显示 {startNum}–{endNum} · 第 {page} / {totalPages} 页
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 font-mono text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} 条
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex items-center gap-1 font-mono tabular-nums">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="首页"
            title="首页"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="上一页"
            title="上一页"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {pageRange.map((entry, idx) =>
            entry === 'ELLIPSIS' ? (
              <span key={`e-${idx}`} className="px-1.5 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                className={`min-w-[28px] px-2 py-1 rounded border text-xs transition-colors ${
                  entry === page
                    ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="下一页"
            title="下一页"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="末页"
            title="末页"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {totalPages > 5 && (
          <form onSubmit={handleJumpSubmit} className="inline-flex items-center gap-1">
            <span className="text-[11px] text-slate-500">跳至</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder={String(page)}
              className="w-12 px-1.5 py-1 font-mono text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-center"
            />
            <button
              type="submit"
              className="px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              跳转
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
