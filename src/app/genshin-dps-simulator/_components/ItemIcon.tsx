import Image from 'next/image';

import { cn } from '@/lib/utils';

type ItemIconProps = {
  src: string;
  alt: string;
  size?: number;
  dimmed?: boolean;
  'data-testid'?: string;
};

const ItemIcon = ({
  src,
  alt,
  size = 52,
  dimmed = false,
  'data-testid': testId = 'item-icon',
}: ItemIconProps) => (
  <span
    data-testid={testId}
    title={alt}
    className={cn(
      'inline-flex aspect-square shrink-0 self-start items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-amber-700 to-orange-400 ring-1 ring-amber-300/30 transition',
      dimmed && 'opacity-40 grayscale'
    )}
  >
    <Image unoptimized src={src} alt={alt} width={size} height={size} />
  </span>
);

export default ItemIcon;
