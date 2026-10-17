import { forwardRef, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import RotationActionIcon from './RotationActionIcon';
import RotationPieceDetails from './RotationPieceDetails';
import CharacterAvatar from '../CharacterAvatar';
import formatNumber from '../../_lib/formatNumber';
import { BlockDamage } from '../../_lib/rotation/automaticRotation';
import { PieceCooldown } from '../../_lib/rotation/cooldownSeries';
import { KIND_STYLES } from '../../_lib/rotation/kindStyles';
import { BlockMember } from '../../_lib/rotation/memberStyles';
import {
  describePiece,
  getPieceDetails,
} from '../../_lib/rotation/pieceDetails';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { TimelinePiece } from '../../_lib/rotation/timelineLayout';
import { RotationBlock } from '../../_lib/rotation/types';

type RotationPieceProps = HTMLAttributes<HTMLDivElement> & {
  block: RotationBlock;
  action: RotationAction;
  piece: TimelinePiece;
  presses?: number[];
  warning?: string | null;
  note?: string | null;
  isSelected?: boolean;
  showDropIndicator?: boolean;
  cooldowns?: PieceCooldown[];
  damage?: BlockDamage;
  // Shown instead of the DMG when there is none to show yet.
  damageNote?: string;
  // While something is being dragged the tooltip would only get in the way.
  suppressTooltip?: boolean;
  // More for the tooltip (a team's members' state at this moment).
  extraDetails?: ReactNode;
  // The piece's own details as one line of symbols.
  compactDetails?: boolean;
  // A team block's member: its color instead of the kind's (the kind
  // becomes a stripe) and its avatar on the action icon.
  member?: BlockMember;
};

const getTimeLabel = (piece: TimelinePiece): string => {
  if (piece.start === null) {
    return 'Not reached';
  }
  return `${formatNumber(piece.start)} s`;
};

// The action as a key, as the game shows it ([E], [Q], [N×3]); Normal
// Attacks add how many hits the block plays (the combo positions, N1, N2…,
// are in the tooltip).
const getPieceLabel = (
  block: RotationBlock,
  action: RotationAction
): string => {
  if (action.steps && action.hitsLabel) {
    return `${action.shortLabel} ${block.hits}`;
  }
  if (action.kind === 'normal' && (action.maxHits ?? 1) > 1) {
    return `${action.shortLabel}×${block.hits}`;
  }
  if (action.kind === 'wait') {
    return `${formatNumber(block.seconds)}s`;
  }
  return action.shortLabel;
};

const getDefaultPresses = (block: RotationBlock): number[] =>
  Array.from({ length: block.hits }, (_, index) => index);

// Compact block on the horizontal timeline: as wide as the time it takes.
// Its details (timing, combo, cooldowns) live in the tooltip.
const RotationPiece = forwardRef<HTMLDivElement, RotationPieceProps>(
  (
    {
      block,
      action,
      piece,
      presses,
      warning = null,
      note = null,
      isSelected = false,
      showDropIndicator = false,
      cooldowns = [],
      damage,
      damageNote,
      suppressTooltip = false,
      extraDetails,
      compactDetails = false,
      member,
      className,
      style,
      ...props
    },
    ref
  ) => {
    // Without simulation data a combo block is assumed to start at N1;
    // single-hit actions (e.g. a bite) have no combo to show.
    const playedPresses =
      presses ?? ((action.maxHits ?? 1) > 1 ? getDefaultPresses(block) : []);
    const details = getPieceDetails({
      block,
      action,
      piece,
      presses: playedPresses,
      cooldowns,
      note,
      warning,
      damage,
      damageNote,
    });

    const span =
      piece.start !== null && piece.end !== null ? piece.end - piece.start : 0;
    const waitedShare = span > 0 ? Math.min(1, piece.waited / span) : 0;

    // Radix keeps the tooltip inside the viewport by flipping or shifting it.
    return (
      <Tooltip open={suppressTooltip ? false : undefined}>
        <TooltipTrigger asChild>
          <div
            ref={ref}
            data-testid={`rotation-piece-${block.action}`}
            aria-label={describePiece(details)}
            className={cn(
              'relative flex h-20 min-w-0 shrink-0 flex-col justify-between overflow-hidden rounded border px-1 py-1',
              member?.chip ?? KIND_STYLES[action.kind].chip,
              member && 'pb-1.5',
              piece.start === null && 'opacity-40',
              isSelected && 'ring-2 ring-primary',
              className
            )}
            style={{ width: piece.width, ...style }}
            {...props}
          >
            {/* Waiting for a cooldown: dead time, grey, at its start. */}
            {waitedShare > 0 && (
              <span
                data-testid='rotation-piece-waiting'
                aria-hidden
                className='pointer-events-none absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,var(--color-zinc-400)_0_4px,var(--color-zinc-300)_4px_8px)] opacity-60 dark:bg-[repeating-linear-gradient(135deg,var(--color-zinc-600)_0_4px,var(--color-zinc-700)_4px_8px)]'
                style={{ width: `${waitedShare * 100}%` }}
              />
            )}
            {member && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 h-[3px]',
                  KIND_STYLES[action.kind].bar
                )}
              />
            )}
            {showDropIndicator && (
              <span className='absolute inset-y-0 left-0 w-1 bg-primary' />
            )}
            <span className='relative flex items-start justify-between gap-0.5'>
              {/* A team block: its member's face, the action below it. */}
              <span className='flex shrink-0 flex-col items-start gap-0.5'>
                {member?.avatar && (
                  <span
                    data-testid='rotation-piece-avatar'
                    title={member.name}
                    className='flex rounded-full'
                  >
                    <CharacterAvatar
                      src={member.avatar}
                      alt={member.name}
                      size={20}
                    />
                  </span>
                )}
                <RotationActionIcon action={action} size={20} />
              </span>
              {warning && (
                <span
                  data-testid='rotation-piece-warning'
                  className='size-1.5 shrink-0 rounded-full bg-amber-500'
                />
              )}
            </span>
            <span className='relative flex min-w-0 items-baseline gap-0.5 overflow-hidden text-[10px] leading-3 whitespace-nowrap'>
              <kbd className='truncate rounded-[3px] border border-current/40 bg-background/60 px-1 font-sans font-bold tabular-nums'>
                {getPieceLabel(block, action)}
              </kbd>
              {block.repeat > 1 && (
                <span className='text-muted-foreground'>↻{block.repeat}</span>
              )}
              {block.dashCancel && (
                <span className='text-muted-foreground'>»</span>
              )}
            </span>
            <span className='relative truncate text-[9px] leading-3 text-muted-foreground tabular-nums'>
              {getTimeLabel(piece)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side='top' collisionPadding={8}>
          <RotationPieceDetails details={details} compact={compactDetails} />
          {extraDetails}
        </TooltipContent>
      </Tooltip>
    );
  }
);

RotationPiece.displayName = 'RotationPiece';

export default RotationPiece;
