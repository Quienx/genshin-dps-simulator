import { Button } from '@/components/ui/button';

import { getPageLabel } from '../_lib/hitPagination';

type HitPaginationProps = {
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

const HitPagination = ({
  page,
  pageCount,
  onPrevious,
  onNext,
}: HitPaginationProps) => {
  const isFirstPage = page <= 0;
  const isLastPage = pageCount === 0 || page >= pageCount - 1;

  return (
    <div
      data-testid='hit-pagination'
      className='flex items-center justify-between gap-2 p-3'
    >
      <Button
        data-testid='hit-pagination-previous'
        variant='secondary'
        size='sm'
        disabled={isFirstPage}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <span data-testid='hit-pagination-label' className='text-sm'>
        {getPageLabel(page, pageCount)}
      </span>
      <Button
        data-testid='hit-pagination-next'
        variant='secondary'
        size='sm'
        disabled={isLastPage}
        onClick={onNext}
      >
        Next
      </Button>
    </div>
  );
};

export default HitPagination;
