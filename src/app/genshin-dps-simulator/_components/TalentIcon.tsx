import Image from 'next/image';

import { cn } from '@/lib/utils';

type TalentIconProps = {
  src: string;
  alt: string;
  size?: number;
  dimmed?: boolean;
  'data-testid'?: string;
};

const PADDING = 12;

const TalentIcon = ({
  src,
  alt,
  size = 40,
  dimmed = false,
  'data-testid': testId = 'talent-icon',
}: TalentIconProps) => (
  <span
    data-testid={testId}
    className={cn(
      'inline-flex aspect-square shrink-0 self-start items-center justify-center rounded-full bg-muted p-1.5 ring-1 ring-white/10 transition',
      dimmed && 'opacity-40 grayscale'
    )}
  >
    <Image
      unoptimized
      src={src}
      alt={alt}
      width={size - PADDING}
      height={size - PADDING}
      className='rounded-full'
    />
  </span>
);

export default TalentIcon;
