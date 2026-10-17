import { SelectItem } from '@/components/ui/select';

import { getPageSizeLabel, PageSizeOption } from '../_lib/hitPagination';

type PageSizeSelectOptionProps = {
  option: PageSizeOption;
};

const PageSizeSelectOption = ({ option }: PageSizeSelectOptionProps) => (
  <SelectItem data-testid={`page-size-select-option-${option}`} value={option}>
    {getPageSizeLabel(option)}
  </SelectItem>
);

export default PageSizeSelectOption;
