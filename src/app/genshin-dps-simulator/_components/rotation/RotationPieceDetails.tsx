import { PieceDetailRow, PieceDetails } from '../../_lib/rotation/pieceDetails';

type RotationPieceDetailsProps = {
  details: PieceDetails;
  // One line of symbols instead of labelled rows (a team's tooltips, where
  // icons show the cooldowns).
  compact?: boolean;
};

const SYMBOLS: Record<string, string> = {
  Time: '⏱',
  Waiting: '⏸',
  DMG: '⚔',
  Hits: '×',
  Then: '»',
  Waits: '⏳',
  Repeat: '↻',
  Effect: '✦',
};

// "245,321 (3 hits, 3.2% of total)" → "245,321 · 3.2%".
const compactDamage = (value: string): string | null => {
  const match = value.match(/^([\d,.]+) \(\d+ hits?, ([\d.,]+%)/);
  return match ? `${match[1]} · ${match[2]}` : null;
};

const toCompact = (row: PieceDetailRow): string | null => {
  if (row.label === 'Lasts') {
    return null;
  }
  if (row.label === 'DMG') {
    return `${SYMBOLS.DMG} ${compactDamage(row.value) ?? row.value}`;
  }
  if (row.label === 'CRIT') {
    if (row.value === 'yes') {
      return 'CRIT';
    }
    return row.value === 'no' ? 'no CRIT' : `CRIT ${row.value}`;
  }
  if (row.label === 'Max hit') {
    return `✦ ${row.value.replace(' (CRIT)', '')}`;
  }
  if (row.label === 'Waiting') {
    return `${SYMBOLS.Waiting} ${row.value.split(' for ')[0]}`;
  }
  return `${SYMBOLS[row.label] ?? row.label} ${row.value}`;
};

// Tooltip body of a timeline piece.
const RotationPieceDetails = ({
  details,
  compact = false,
}: RotationPieceDetailsProps) => (
  <div data-testid='rotation-piece-tooltip' className='max-w-64 text-left'>
    <p className='mb-1 font-semibold'>{details.title}</p>
    {compact ? (
      <p className='tabular-nums opacity-90'>
        {details.rows
          .map(toCompact)
          .filter((part): part is string => Boolean(part))
          .join(' · ')}
      </p>
    ) : (
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'>
        {details.rows.map((row) => (
          <div key={row.label} className='contents'>
            <dt className='opacity-70'>{row.label}</dt>
            <dd className='tabular-nums'>{row.value}</dd>
          </div>
        ))}
      </dl>
    )}
    {details.warning && <p className='mt-1 font-medium'>⚠ {details.warning}</p>}
  </div>
);

export default RotationPieceDetails;
