import { useMemo, useState } from 'react';

import HitPagination from './HitPagination';
import HitTable from './HitTable';
import HitTimelineChart from './HitTimelineChart';
import HitToolbar from './HitToolbar';
import exportHitsCsv from '../_lib/exportHitsCsv';
import {
  ALL_CATEGORIES,
  clampPage,
  DEFAULT_PAGE_SIZE,
  filterHits,
  getHitCategories,
  getHitSummary,
  PageSizeOption,
  resolvePageSize,
} from '../_lib/hitPagination';
import { HitLogEntry } from '../_lib/types';

type HitTablePanelProps = {
  csvFileName: string;
  hits: HitLogEntry[];
};

const sumDamage = (hits: HitLogEntry[]): number =>
  hits.reduce((total, hit) => total + hit.damage, 0);

const HitTablePanel = ({ csvFileName, hits }: HitTablePanelProps) => {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [pageSizeOption, setPageSizeOption] =
    useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);

  const categories = useMemo(() => getHitCategories(hits), [hits]);
  const filteredHits = useMemo(
    () => filterHits(hits, category),
    [hits, category]
  );

  const pageSize = resolvePageSize(pageSizeOption, hits.length);
  const pageCount = Math.ceil(filteredHits.length / pageSize);
  const currentPage = clampPage(page, pageCount);
  const start = currentPage * pageSize;
  const visibleHits = filteredHits.slice(start, start + pageSize);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(0);
  };

  const handlePageSizeChange = (value: PageSizeOption) => {
    setPageSizeOption(value);
    setPage(0);
  };

  const goToPreviousPage = () => {
    setPage(Math.max(0, currentPage - 1));
  };

  const goToNextPage = () => {
    setPage(currentPage + 1);
  };

  const handleExport = () => {
    exportHitsCsv(hits, csvFileName);
  };

  return (
    <div data-testid='hit-table-panel' className='flex min-h-0 flex-1 flex-col'>
      <HitToolbar
        categories={categories}
        category={category}
        pageSize={pageSizeOption}
        canExport={hits.length > 0}
        onCategoryChange={handleCategoryChange}
        onPageSizeChange={handlePageSizeChange}
        onExport={handleExport}
      />

      <p
        data-testid='hit-table-panel-summary'
        className='px-3 pb-3 text-sm text-muted-foreground'
      >
        {getHitSummary({
          totalHits: hits.length,
          start,
          visibleCount: visibleHits.length,
          filteredCount: filteredHits.length,
          filteredDamage: sumDamage(filteredHits),
        })}
      </p>

      <HitTimelineChart hits={filteredHits} categories={categories} />

      <HitTable hits={visibleHits} />

      <HitPagination
        page={currentPage}
        pageCount={pageCount}
        onPrevious={goToPreviousPage}
        onNext={goToNextPage}
      />
    </div>
  );
};

export default HitTablePanel;
