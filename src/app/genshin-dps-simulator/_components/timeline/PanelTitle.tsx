import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import SectionHelp from './SectionHelp';
import { SectionHelpKey } from './sectionHelp';

// A panel's title, with its help next to it.
const PanelTitle = ({
  section,
  className,
  children,
}: {
  section: SectionHelpKey;
  className?: string;
  children: ReactNode;
}) => (
  <h2
    className={cn(
      'flex items-center gap-1.5 text-sm font-semibold text-foreground',
      className
    )}
  >
    {children}
    <SectionHelp section={section} />
  </h2>
);

export default PanelTitle;
