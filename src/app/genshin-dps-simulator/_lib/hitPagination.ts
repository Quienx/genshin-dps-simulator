import formatNumber from './formatNumber';
import { HitLogEntry } from './types';

export const ALL_CATEGORIES = 'all';

export type PageSizeOption = '50' | '100' | '250' | 'all';

export const PAGE_SIZE_OPTIONS: PageSizeOption[] = ['50', '100', '250', 'all'];

export const DEFAULT_PAGE_SIZE: PageSizeOption = '100';

export const isPageSizeOption = (value: string): value is PageSizeOption =>
  PAGE_SIZE_OPTIONS.some((option) => option === value);

export const getPageSizeLabel = (option: PageSizeOption): string => {
  if (option === 'all') {
    return 'All';
  }
  return option;
};

export const getHitCategories = (hits: HitLogEntry[]): string[] =>
  Array.from(new Set(hits.map((hit) => hit.category)));

export const filterHits = (
  hits: HitLogEntry[],
  category: string
): HitLogEntry[] => {
  if (category === ALL_CATEGORIES) {
    return hits;
  }
  return hits.filter((hit) => hit.category === category);
};

export const resolvePageSize = (
  option: PageSizeOption,
  totalHits: number
): number => {
  if (option === 'all') {
    return Math.max(1, totalHits);
  }
  return Number(option);
};

export const clampPage = (page: number, pageCount: number): number => {
  if (pageCount === 0) {
    return 0;
  }
  return Math.min(Math.max(0, page), pageCount - 1);
};

export const getPageLabel = (page: number, pageCount: number): string => {
  if (pageCount === 0) {
    return 'Page 0 of 0';
  }
  return `Page ${page + 1} of ${pageCount}`;
};

type HitSummaryInput = {
  totalHits: number;
  start: number;
  visibleCount: number;
  filteredCount: number;
  filteredDamage: number;
};

const getFirstShownHit = (start: number, filteredCount: number): number => {
  if (filteredCount === 0) {
    return 0;
  }
  return start + 1;
};

export const getHitSummary = ({
  totalHits,
  start,
  visibleCount,
  filteredCount,
  filteredDamage,
}: HitSummaryInput): string => {
  if (totalHits === 0) {
    return 'Run a simulation to see the hits.';
  }
  const firstShown = getFirstShownHit(start, filteredCount);
  const lastShown = Math.min(start + visibleCount, filteredCount);
  return `Showing ${firstShown}–${lastShown} of ${filteredCount} hits. DMG of the filtered hits: ${formatNumber(
    filteredDamage
  )}.`;
};
