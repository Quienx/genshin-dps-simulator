import { ReactNode } from 'react';

type ResultStatTileProps = {
  label: string;
  value: string;
  detail?: ReactNode;
  'data-testid'?: string;
};

const ResultStatTile = ({
  label,
  value,
  detail,
  'data-testid': testId = 'result-stat-tile',
}: ResultStatTileProps) => (
  <div
    data-testid={testId}
    className='min-w-0 rounded-lg bg-muted px-2.5 py-1.5 leading-tight'
  >
    <div className='flex items-baseline justify-between gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase'>
      <span className='truncate'>{label}</span>
      <span className='truncate font-normal normal-case'>{detail}</span>
    </div>
    <div
      data-testid={`${testId}-value`}
      className='truncate text-base font-bold tabular-nums'
    >
      {value}
    </div>
  </div>
);

export default ResultStatTile;
