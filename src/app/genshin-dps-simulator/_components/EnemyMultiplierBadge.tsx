import { Badge } from '@/components/ui/badge';

import { toTestIdSlug } from '../_lib/labels';

type EnemyMultiplierBadgeProps = {
  label: string;
  multiplier: number;
};

const EnemyMultiplierBadge = ({
  label,
  multiplier,
}: EnemyMultiplierBadgeProps) => (
  <Badge
    data-testid={`enemy-multiplier-badge-${toTestIdSlug(label)}`}
    variant='muted'
  >
    {label} ×{(multiplier * 100).toFixed(2)}%
  </Badge>
);

export default EnemyMultiplierBadge;
