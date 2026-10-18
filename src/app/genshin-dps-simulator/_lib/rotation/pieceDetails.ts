import { BlockDamage } from './automaticRotation';
import { getBlockTitle } from './blocks';
import { PieceCooldown } from './cooldownSeries';
import { RotationAction } from './rotationSchema';
import { TimelinePiece } from './timelineLayout';
import { RotationBlock } from './types';
import formatNumber from '../formatNumber';

export type PieceDetailRow = { label: string; value: string };

export type PieceDetails = {
  title: string;
  rows: PieceDetailRow[];
  warning: string | null;
};

type PieceDetailsInput = {
  block: RotationBlock;
  action: RotationAction;
  piece: TimelinePiece;
  presses: number[];
  cooldowns: PieceCooldown[];
  note: string | null;
  warning: string | null;
  damage?: BlockDamage;
  // Shown instead of the DMG when there is none to show yet.
  damageNote?: string;
};

const seconds = (value: number) => `${formatNumber(value)} s`;

const getTimingRows = (piece: TimelinePiece): PieceDetailRow[] => {
  if (piece.start === null || piece.end === null) {
    return [{ label: 'Time', value: 'Not reached in the simulation' }];
  }
  return [
    {
      label: 'Time',
      value: `${seconds(piece.start)} → ${seconds(piece.end)}`,
    },
    { label: 'Lasts', value: seconds(piece.end - piece.start) },
    ...(piece.waited > 0
      ? [
          {
            label: 'Waiting',
            value: `${seconds(piece.waited)} for the cooldown (dead time)`,
          },
        ]
      : []),
  ];
};

// The block's own hits (with every repeat), and its share of the run.
// Hits of statuses an action started (e.g. Directive ticks) are not
// counted here.
const getCritValue = ({ crits = 0, hits }: BlockDamage): string => {
  if (hits === 1) {
    return crits > 0 ? 'yes' : 'no';
  }
  return `${crits} of ${hits}`;
};

const getDamageRow = (
  damage: BlockDamage | undefined,
  action: RotationAction,
  piece: TimelinePiece,
  damageNote: string | undefined
): PieceDetailRow[] => {
  if (!damage && damageNote && piece.start !== null) {
    return [{ label: 'DMG', value: damageNote }];
  }
  if (!damage) {
    const reachedAction =
      piece.start !== null && action.kind !== 'wait' && action.kind !== 'dodge';
    return reachedAction ? [{ label: 'DMG', value: 'No DMG of its own' }] : [];
  }
  const hits = `${damage.hits} hit${damage.hits === 1 ? '' : 's'}`;
  const share = `${formatNumber(Math.round(damage.share * 1000) / 10)}%`;
  return [
    {
      label: 'DMG',
      value: `${formatNumber(
        Math.round(damage.damage)
      )} (${hits}, ${share} of total)`,
    },
    // Rolled: what it dealt, and whether it CRIT.
    ...(damage.crits !== undefined
      ? [{ label: 'CRIT', value: getCritValue(damage) }]
      : []),
    // Expected DMG averages CRITs in; its biggest hit if it CRITs is what
    // "Highest hit" shows.
    ...(damage.crits === undefined && damage.maxHit > 0
      ? [
          {
            label: 'Max hit',
            value: `${formatNumber(Math.round(damage.maxHit))} (CRIT)`,
          },
        ]
      : []),
  ];
};

// One repetition's hits; with Repeat the same pattern plays again.
const formatPresses = (block: RotationBlock, presses: number[]): string =>
  presses
    .slice(0, block.hits)
    .map((index) => `N${index + 1}`)
    .join(', ');

const getBlockRows = (
  block: RotationBlock,
  action: RotationAction,
  presses: number[]
): PieceDetailRow[] => {
  const rows: PieceDetailRow[] = [];
  if (action.steps && action.hitsLabel) {
    rows.push({
      label: action.hitsLabel,
      value: `${block.hits} planned`,
    });
  }
  if (action.kind === 'normal' && presses.length > 0) {
    rows.push({ label: 'Hits', value: formatPresses(block, presses) });
  }
  if (action.kind === 'normal') {
    if (block.dashCancel) {
      rows.push({ label: 'Then', value: 'Dash after each repeat' });
    }
  }
  if (action.count) {
    rows.push({ label: action.count.label, value: String(block.hits) });
  }
  if (block.hold && action.hold) {
    rows.push({ label: 'Hold', value: 'Yes' });
  }
  if (action.kind === 'wait') {
    rows.push({ label: 'Waits', value: seconds(block.seconds) });
  }
  if (block.repeat > 1) {
    rows.push({ label: 'Repeat', value: `×${block.repeat}` });
  }
  return rows;
};

const getCooldownRow = (
  cooldown: PieceCooldown,
  start: number
): PieceDetailRow => {
  const label = `${cooldown.label} cooldown`;
  if (cooldown.isOwnAction) {
    if (cooldown.readyAt === null) {
      return { label, value: seconds(cooldown.remaining) };
    }
    // Full cooldown set on use vs when it really ended after the cuts.
    const cut = Math.max(0, start + cooldown.remaining - cooldown.readyAt);
    return {
      label,
      value: `${seconds(cooldown.remaining)}, ready at ${seconds(
        cooldown.readyAt
      )}${cut > 0 ? ` (−${seconds(cut)})` : ''}`,
    };
  }
  return {
    label,
    value:
      cooldown.remaining > 0
        ? `ready in ${seconds(cooldown.remaining)}`
        : 'ready',
  };
};

export const getPieceDetails = ({
  block,
  action,
  piece,
  presses,
  cooldowns,
  note,
  warning,
  damage,
  damageNote,
}: PieceDetailsInput): PieceDetails => ({
  title: getBlockTitle(block, action),
  rows: [
    ...getTimingRows(piece),
    ...getDamageRow(damage, action, piece, damageNote),
    ...getBlockRows(block, action, presses),
    ...cooldowns.map((cooldown) => getCooldownRow(cooldown, piece.start ?? 0)),
    ...(note ? [{ label: 'Effect', value: note }] : []),
  ],
  warning,
});

export const describePiece = (details: PieceDetails): string =>
  [
    details.title,
    ...details.rows.map((row) => `${row.label}: ${row.value}`),
    details.warning,
  ]
    .filter(Boolean)
    .join('. ');
