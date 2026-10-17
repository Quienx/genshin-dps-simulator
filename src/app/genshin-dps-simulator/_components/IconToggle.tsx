import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import Image from 'next/image';

import { cn } from '@/lib/utils';

type IconToggleProps = {
  id: string;
  src: string;
  alt: string;
  checked: boolean;
  onCheckedChange: (state: CheckboxPrimitive.CheckedState) => void;
  'data-testid'?: string;
};

const ICON_SIZE = 28;

const IconToggle = ({
  id,
  src,
  alt,
  checked,
  onCheckedChange,
  'data-testid': testId = 'icon-toggle',
}: IconToggleProps) => (
  <CheckboxPrimitive.Root
    id={id}
    data-testid={testId}
    aria-label={alt}
    checked={checked}
    onCheckedChange={onCheckedChange}
    className={cn(
      'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center self-start rounded-full bg-muted ring-1 ring-white/10 transition outline-none',
      'focus-visible:ring-[3px] focus-visible:ring-ring/50',
      'data-[state=checked]:bg-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary',
      'data-[state=unchecked]:opacity-40 data-[state=unchecked]:grayscale data-[state=unchecked]:hover:opacity-70'
    )}
  >
    <Image
      unoptimized
      src={src}
      alt=''
      width={ICON_SIZE}
      height={ICON_SIZE}
      className='rounded-full'
    />
  </CheckboxPrimitive.Root>
);

export default IconToggle;
