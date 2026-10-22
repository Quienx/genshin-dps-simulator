import {
  ArrowLeftRight,
  ChevronsRight,
  Hourglass,
  Swords,
  Waves,
} from 'lucide-react';
import Image from 'next/image';

import { cn } from '@/lib/utils';

import { iconUrl } from '../../_lib/genshinIcons';
import {
  RotationAction,
  RotationActionKind,
} from '../../_lib/rotation/rotationSchema';

type RotationActionIconProps = {
  action: RotationAction;
  size?: number;
  className?: string;
};

// Dodge, Wait and Swap have no in-game icon, so they (and any action whose file
// has no icon) get a generic one.
const FALLBACK_ICONS: Partial<Record<RotationActionKind, typeof Swords>> = {
  dodge: ChevronsRight,
  wait: Hourglass,
  swap: ArrowLeftRight,
  move: Waves,
};

const RotationActionIcon = ({
  action,
  size = 28,
  className,
}: RotationActionIconProps) => {
  const FallbackIcon = FALLBACK_ICONS[action.kind] ?? Swords;

  return (
    <span
      data-testid={`rotation-icon-${action.id}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted p-0.5 ring-1 ring-white/10',
        className
      )}
      style={{ width: size, height: size }}
    >
      {action.icon ? (
        <Image
          unoptimized
          src={iconUrl(action.icon)}
          alt=''
          width={size - 4}
          height={size - 4}
        />
      ) : (
        <FallbackIcon className='size-full text-muted-foreground' aria-hidden />
      )}
    </span>
  );
};

export default RotationActionIcon;
