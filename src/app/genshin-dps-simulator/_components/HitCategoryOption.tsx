import { SelectItem } from '@/components/ui/select';

import { toTestIdSlug } from '../_lib/labels';

type HitCategoryOptionProps = {
  category: string;
};

const HitCategoryOption = ({ category }: HitCategoryOptionProps) => (
  <SelectItem
    data-testid={`hit-category-option-${toTestIdSlug(category)}`}
    value={category}
  >
    {category}
  </SelectItem>
);

export default HitCategoryOption;
