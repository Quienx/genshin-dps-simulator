import { Download } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import HitCategoryOption from './HitCategoryOption';
import PageSizeSelectOption from './PageSizeSelectOption';
import {
  ALL_CATEGORIES,
  isPageSizeOption,
  PAGE_SIZE_OPTIONS,
  PageSizeOption,
} from '../_lib/hitPagination';

type HitToolbarProps = {
  categories: string[];
  category: string;
  pageSize: PageSizeOption;
  canExport: boolean;
  onCategoryChange: (category: string) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
  onExport: () => void;
};

const HitToolbar = ({
  categories,
  category,
  pageSize,
  canExport,
  onCategoryChange,
  onPageSizeChange,
  onExport,
}: HitToolbarProps) => {
  const categoryId = useId();
  const pageSizeId = useId();

  const handlePageSizeChange = (value: string) => {
    if (!isPageSizeOption(value)) {
      return;
    }
    onPageSizeChange(value);
  };

  return (
    <div
      data-testid='hit-toolbar'
      className='flex flex-wrap items-end gap-3 p-3'
    >
      <div className='space-y-1.5'>
        <Label htmlFor={categoryId}>Filter by type</Label>
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger
            id={categoryId}
            data-testid='hit-toolbar-category'
            className='w-48'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              data-testid='hit-toolbar-category-all'
              value={ALL_CATEGORIES}
            >
              All attacks
            </SelectItem>
            {categories.map((hitCategory) => (
              <HitCategoryOption key={hitCategory} category={hitCategory} />
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor={pageSizeId}>Rows per page</Label>
        <Select value={pageSize} onValueChange={handlePageSizeChange}>
          <SelectTrigger
            id={pageSizeId}
            data-testid='hit-toolbar-page-size'
            className='w-28'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <PageSizeSelectOption key={option} option={option} />
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        data-testid='hit-toolbar-export'
        variant='secondary'
        disabled={!canExport}
        onClick={onExport}
      >
        <Download />
        Export CSV
      </Button>
    </div>
  );
};

export default HitToolbar;
