import { Badge, BadgeProps } from '@/components/ui/badge';

import { KitStatus } from '../_lib/types';

type KitStatusBadgeProps = {
  status?: KitStatus;
};

type StatusAppearance = {
  label: string;
  variant: BadgeProps['variant'];
};

const getStatusAppearance = (status: KitStatus): StatusAppearance => {
  switch (status) {
    case 'applied':
      return { label: 'Applied', variant: 'default' };
    case 'disabled':
      return { label: 'Disabled', variant: 'muted' };
    case 'included':
      return { label: 'Included in stats', variant: 'outline' };
    case 'no-effect':
      return { label: 'No effect (no Q)', variant: 'warning' };
    case 'not-simulated':
      return { label: 'Not simulated', variant: 'outline' };
    default:
      return { label: 'Disabled', variant: 'muted' };
  }
};

const KitStatusBadge = ({ status }: KitStatusBadgeProps) => {
  if (!status) {
    return null;
  }
  const { label, variant } = getStatusAppearance(status);
  return (
    <Badge
      data-testid={`kit-status-badge-${status}`}
      variant={variant}
      className='shrink-0'
    >
      {label}
    </Badge>
  );
};

export default KitStatusBadge;
