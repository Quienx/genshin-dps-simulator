import { getCritLabel } from './labels';
import { HitLogEntry } from './types';

const CSV_HEADERS = [
  'Hit #',
  'Time (s)',
  'Attack',
  'Element',
  'Stacks',
  'Multiplier (%)',
  'Base DMG',
  'Total DMG Bonus (%)',
  'Extra DMG Bonus (%)',
  'CRIT Rate (%)',
  'CRIT',
  'Reaction',
  'Reaction multiplier',
  'DMG dealt',
  'Max possible DMG',
  'Cumulative DMG',
  'Notes',
];

const OBJECT_URL_LIFETIME_MS = 1000;
// The BOM makes Excel open the semicolon-separated file as UTF-8.
const UTF8_BOM = String.fromCharCode(0xfeff);

const toCsvRow = (hit: HitLogEntry): Array<string | number> => [
  hit.index,
  hit.time,
  hit.category,
  hit.element,
  hit.stacks ?? '',
  hit.multiplier,
  hit.baseDamage,
  hit.totalBonus,
  hit.extraBonus,
  hit.critRate * 100,
  getCritLabel(hit.isCrit),
  hit.reaction,
  hit.reactionMultiplier,
  hit.damage,
  hit.maxDamage,
  hit.cumulativeDamage,
  hit.notes,
];

const toCsvCell = (value: string | number): string =>
  `"${String(value).replace(/"/g, '""')}"`;

export const buildHitsCsv = (hits: HitLogEntry[]): string => {
  const rows = [CSV_HEADERS, ...hits.map(toCsvRow)];
  return `${UTF8_BOM}${rows
    .map((row) => row.map(toCsvCell).join(';'))
    .join('\r\n')}`;
};

const exportHitsCsv = (hits: HitLogEntry[], fileName: string) => {
  const blob = new Blob([buildHitsCsv(hits)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
};

export default exportHitsCsv;
