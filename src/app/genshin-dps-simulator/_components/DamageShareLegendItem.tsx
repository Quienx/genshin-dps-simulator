import { cn } from '@/lib/utils';

import { CategoryShare } from '../_lib/damageMeter';
import formatNumber from '../_lib/formatNumber';
import { toTestIdSlug } from '../_lib/labels';

type DamageShareLegendItemProps = {
  categoryShare: CategoryShare;
  colorClassName: string;
};

const DamageShareLegendItem = ({
  categoryShare,
  colorClassName,
}: DamageShareLegendItemProps) => (
  <li
    data-testid={`damage-share-legend-item-${toTestIdSlug(
      categoryShare.category
    )}`}
    className='flex items-center gap-1.5 whitespace-nowrap'
  >
    <span className={cn('size-2 shrink-0 rounded-full', colorClassName)} />
    <span>{categoryShare.category}</span>
    <span className='text-muted-foreground tabular-nums'>
      {formatNumber(Math.round(categoryShare.damage))} ·{' '}
      {categoryShare.share.toFixed(1)}%
    </span>
  </li>
);

export default DamageShareLegendItem;
