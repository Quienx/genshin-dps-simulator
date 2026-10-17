import { ReactNode } from 'react';

type SectionHeadingProps = {
  title: string;
  detail?: string;
  icon?: ReactNode;
  'data-testid'?: string;
};

const SectionHeading = ({
  title,
  detail,
  icon,
  'data-testid': testId = 'section-heading',
}: SectionHeadingProps) => (
  <div
    data-testid={testId}
    className='mt-5 mb-2 flex items-center justify-between gap-2 border-t pt-4'
  >
    <div className='flex items-center gap-2'>
      {icon}
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        {title}
      </h3>
    </div>
    <span className='text-xs text-muted-foreground'>{detail}</span>
  </div>
);

export default SectionHeading;
