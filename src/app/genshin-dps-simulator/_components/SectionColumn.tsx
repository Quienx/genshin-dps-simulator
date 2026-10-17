import { ReactNode } from 'react';

type SectionColumnProps = {
  children: ReactNode;
  'data-testid'?: string;
};

const SectionColumn = ({
  children,
  'data-testid': testId = 'section-column',
}: SectionColumnProps) => (
  <div data-testid={testId} className='flex min-w-0 flex-col gap-4'>
    {children}
  </div>
);

export default SectionColumn;
