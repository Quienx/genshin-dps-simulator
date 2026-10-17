import { ChevronDown } from 'lucide-react';
import { ReactNode } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type SkillSectionProps = {
  title: string;
  detail?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
};

const SkillSection = ({
  title,
  detail,
  icon,
  children,
  'data-testid': testId = 'skill-section',
}: SkillSectionProps) => (
  <Collapsible data-testid={testId} className='mt-4 rounded-lg border'>
    <div className='flex items-center gap-2 pr-3'>
      <CollapsibleTrigger
        data-testid={`${testId}-toggle`}
        className='flex min-w-0 flex-1 items-center gap-2 p-3 text-left'
      >
        {icon}
        <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
          {title}
        </h3>
      </CollapsibleTrigger>
      <span className='shrink-0 text-xs text-muted-foreground'>{detail}</span>
      <CollapsibleTrigger
        data-testid={`${testId}-chevron`}
        aria-label={`Toggle ${title}`}
        className='shrink-0 [&[data-state=open]>svg]:rotate-180'
      >
        <ChevronDown className='size-4 transition-transform' />
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent data-testid={`${testId}-content`} className='px-3 pb-3'>
      {children}
    </CollapsibleContent>
  </Collapsible>
);

export default SkillSection;
