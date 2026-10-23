import { useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Trash2,
  X,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { NumberField } from '@/components/ui/number-field';
import { Stepper } from '@/components/ui/stepper';
import { toggleVariants } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { payloadOf, TRASH_DROP_ID } from './rotationDnd';
import SectionHelp from './SectionHelp';
import { TimelineMember } from './TimelineChart';
import { applyDrop, DragPayload } from './timelineData';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { describeActionCost, getActionCost } from '../../_lib/actionCosts';
import { getLoadedCharacter } from '../../_lib/characterData';
import {
  isFieldAction,
  splitTeamActionId,
} from '../../_lib/engine/simulateTeam';
import {
  cancelsHold,
  chargesIn,
  heldFramesOf,
  minHeldFramesOf,
  playedHold,
  removeBlock,
  removeBlocks,
  updateBlock,
} from '../../_lib/rotation/blocks';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { RotationBlock, RotationSetting } from '../../_lib/rotation/types';
import { getGeneralPaletteActions } from '../../_lib/team';

type RotationEditBarProps = {
  members: TimelineMember[];
  // Every member's actions (team ids, "arlecchino:normal").
  actions: RotationAction[];
  rotation: RotationSetting;
  // The block whose controls show (the last one picked), and every block
  // picked (several: moved, removed or cleared together).
  selected: string | null;
  selection?: string[];
  // How long the picked held block can go before the state its form lasts
  // while ends (the Flamestrider), from the last run; null: no limit.
  holdLimit?: { frames: number; label: string } | null;
  onChange: (rotation: RotationSetting) => void;
  onSelect: (blockUid: string | null) => void;
  onClearSelection?: () => void;
};

// An on/off option of the block picked (CDC, Final hit, Hold): the look of
// a toggle group's item. A disabled one stays readable: its tooltip says
// why.
const TOGGLE = cn(
  toggleVariants({ variant: 'outline', size: '2xs' }),
  'disabled:opacity-60'
);

// A Dash block's charge cancel (Mavuika's CDC), when its member's dash has
// one: on between two of the actions it joins (her spins), the next one
// starts that many frames into the Dash instead of at its cancel.
const QuickCancelToggle = ({
  block,
  previous,
  next,
  onChange,
}: {
  block: RotationBlock;
  previous: RotationBlock | undefined;
  next: RotationBlock | undefined;
  onChange: (quickCancel: boolean) => void;
}) => {
  const { characterId } = splitTeamActionId(block.action);
  const quick = Object.values(getLoadedCharacter(characterId).actions).find(
    (entry) => entry.quickCancel
  )?.quickCancel;
  if (!quick) {
    return null;
  }
  const isMembers = (entry: RotationBlock | undefined, id: string) =>
    entry !== undefined &&
    splitTeamActionId(entry.action).characterId === characterId &&
    splitTeamActionId(entry.action).actionId === id;
  const between =
    isMembers(previous, quick.after) && isMembers(next, quick.into);
  const on = between && block.quickCancel === true;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid='timeline-block-quick-cancel-tip'
          tabIndex={between ? undefined : 0}
          className='ml-2 inline-flex'
        >
          <button
            type='button'
            data-testid='timeline-block-quick-cancel'
            data-state={on ? 'on' : 'off'}
            aria-pressed={on}
            disabled={!between}
            onClick={() => onChange(!block.quickCancel)}
            className={TOGGLE}
          >
            CDC
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-72'>
        <p className='font-semibold text-foreground'>
          Charge → Dash → Charge (CDC)
        </p>
        <p className='mt-1'>
          This Charged Attack cancels the Dash before it: it starts{' '}
          {quick.frames} frames into the Dash instead of waiting for it to end,
          so the spin begins sooner and everything after it moves up. The Dash
          still deals its hit.
        </p>
        <p className='mt-1 text-subtle'>
          {between
            ? 'On by itself when this Charged Attack is dropped right after a Dash. Not possible when the spin before the Dash was let go at a locked angle (79–87 frames into it, then every 45): the run warns and the Dash plays in full.'
            : 'Only after a Dash that follows another Charged Attack of this character.'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

// What cancels a held action at its release, in words ("a Dash, an E, a
// Q or another member's block").
const CANCELLER_NAMES: Record<string, string> = {
  dodge: 'a Dash',
  skill: 'an E',
  burst: 'a Q',
  swap: "another member's block",
};
const cancellersText = (cancelledBy: string[] = []) => {
  const names = cancelledBy.map((id) => CANCELLER_NAMES[id] ?? id);
  return names.length <= 1
    ? names[0] ?? 'a Dash'
    : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
};

// A hold time in seconds, cut to 2 decimals (50 frames: 0.83 s). It still
// plays the same frame: the cut is under half a frame.
const toHeldSeconds = (frames: number) =>
  Math.floor((frames * 100) / 60 + 1e-9) / 100;

// A held action with a hold time (Mavuika's Flamestrider Charged
// Attack): how long, in seconds, and how many charges (repeated hits) that
// gets; Prev / Next charge move it to the charge before or after.
const HoldControls = ({
  block,
  canCancel,
  hold,
  limit,
  onChange,
}: {
  block: RotationBlock;
  // The block after it cancels it at the release (a Dash): only then can
  // its Final hit be turned off.
  canCancel: boolean;
  hold: NonNullable<NonNullable<RotationAction['count']>['hold']>;
  // Until when its form lasts (the Flamestrider), from its start: no
  // charge past it (the Final still comes after the release).
  limit?: { frames: number; label: string } | null;
  onChange: (patch: Partial<RotationBlock>) => void;
}) => {
  const frames = heldFramesOf(block, hold);
  const charges = chargesIn(frames, hold);
  // With no Final hit (a Dash after), it can be let go sooner.
  const minFrames = minHeldFramesOf(block, hold);
  const [text, setText] = useState<string | null>(null);
  // The longest hold: the action's, or until its form ends (as the last
  // run played it), never under its minimum.
  const longest = limit
    ? Math.max(minFrames, Math.min(hold.maxFrames, limit.frames))
    : hold.maxFrames;
  const setFrames = (next: number) =>
    onChange({
      heldSeconds: toHeldSeconds(
        Math.min(longest, Math.max(minFrames, Math.round(next)))
      ),
    });
  // The frame of charge `n` (1 = the first).
  const chargeFrame = (n: number) =>
    hold.firstHitFrame + (n - 1) * hold.hitEveryFrames;
  const canNext = chargeFrame(charges + 1) <= longest;
  const maxCharges = chargesIn(longest, hold);
  // Held past where its form ends (a change before it shortened it).
  const over = frames > longest;
  // The time typed is when its closing hit lands (the Final), from the
  // start; with none (cancelled at the release), when it is let go.
  const closingAfter =
    block.noFinal === true ? 0 : hold.closingAfterFrames ?? 0;
  const shown = (held: number) => ((held + closingAfter) / 60).toFixed(2);
  // Down to no charge at all when it can be let go before the first.
  const fewest = minFrames < hold.firstHitFrame ? 0 : 1;
  const canPrev = charges > fewest;
  return (
    <span className='flex items-center gap-1'>
      <Button
        variant='secondary'
        size='2xs'
        data-testid='timeline-block-charge-prev'
        title='Hold until the charge before'
        disabled={!canPrev}
        onClick={() => setFrames(chargeFrame(charges - 1))}
      >
        <ChevronLeft className='size-3' />
        Prev charge
      </Button>
      <NumberField
        variant='boxed'
        size='xs'
        aria-label={
          closingAfter > 0
            ? 'Final hit lands at (seconds)'
            : 'Let go at (seconds)'
        }
        title={
          closingAfter > 0
            ? `When the Final hit lands, from the start (it lands ${(
                closingAfter / 60
              ).toFixed(2)} s after letting go)`
            : 'When the spin is let go, from the start (no Final hit)'
        }
        data-testid='timeline-block-held'
        value={text ?? shown(frames)}
        min={shown(minFrames)}
        max={shown(longest)}
        step={0.01}
        onChange={(event) => setText(event.target.value)}
        // Typing is done (left the field, or Enter): hold until then.
        onCommit={() => {
          const next = Number(text);
          if (text !== null && Number.isFinite(next)) {
            setFrames(next * 60 - closingAfter);
          }
          setText(null);
        }}
        className='w-14'
      />
      s{closingAfter > 0 ? ' (Final)' : ''}
      <Button
        variant='secondary'
        size='2xs'
        data-testid='timeline-block-charge-next'
        title='Hold until the next charge'
        disabled={!canNext}
        onClick={() => setFrames(chargeFrame(charges + 1))}
      >
        Next charge
        <ChevronRight className='size-3' />
      </Button>
      {/* How many charges: the tag opens a list to hold until one. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Badge
            variant='brand'
            size='sm'
            asChild
            className='ml-1 outline-none hover:bg-brand-500/30'
          >
            <button
              type='button'
              aria-label='Charges'
              data-testid='timeline-block-charges'
            >
              {charges} {charges === 1 ? 'charge' : 'charges'}
            </button>
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='min-w-28'>
          {Array.from(
            { length: maxCharges - fewest + 1 },
            (_, index) => index + fewest
          ).map((n) => (
            <DropdownMenuItem
              key={n}
              data-testid={`timeline-block-charges-${n}`}
              onSelect={() => setFrames(chargeFrame(n))}
              className={cn(n === charges && 'text-brand-200')}
            >
              {n} {n === 1 ? 'charge' : 'charges'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Where its form ends: up to how many charges fit, or (held past
          it after a change before) a click back to that. */}
      {limit && longest < hold.maxFrames && (
        <button
          type='button'
          data-testid='timeline-block-hold-limit'
          disabled={!over}
          onClick={() => setFrames(longest)}
          title={
            over
              ? `Held past where the ${limit.label} ends: its charges after it would not be dealt. Click to hold until then.`
              : `The ${limit.label} ends ${(limit.frames / 60).toFixed(
                  2
                )} s into it: no charge after that (the Final still comes).`
          }
          className={cn(
            'ml-1 rounded px-1.5 py-0.5 text-2xs',
            over
              ? 'bg-amber-500/25 text-amber-100 hover:bg-amber-500/35'
              : 'text-subtle'
          )}
        >
          {over
            ? `Only ${maxCharges} fit: hold until then`
            : `max ${maxCharges} (${limit.label} ends)`}
        </button>
      )}
      {/* A disabled button gets no hover: the tooltip sits on a wrapper,
          so it says why the Final cannot be turned off. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid='timeline-block-keep-final-tip'
            tabIndex={canCancel ? undefined : 0}
            className='ml-2 inline-flex'
          >
            <button
              type='button'
              data-testid='timeline-block-keep-final'
              data-state={block.noFinal !== true ? 'on' : 'off'}
              aria-pressed={block.noFinal !== true}
              disabled={!canCancel}
              onClick={() => onChange({ noFinal: !block.noFinal })}
              className={TOGGLE}
            >
              Final hit
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-64'>
          {canCancel
            ? 'The Final hit after the spin. Off: the block right after cancels the spin at the release, with no Final, and it can be let go from 0.1 s.'
            : `Always on: nothing right after this Charged Attack cancels the spin, so the game plays its Final hit (after a 0.83 s spin at least). Put ${cancellersText(
                hold.cancelledBy
              )} right after it to turn it off.`}
        </TooltipContent>
      </Tooltip>
    </span>
  );
};

// A member's action: drag it onto the chart to add it where it drops; a
// click adds it at the end.
const PaletteItem = ({
  action,
  onAdd,
}: {
  action: RotationAction;
  onAdd: () => void;
}) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `new:${action.id}`,
    data: { kind: 'new', actionId: action.id } satisfies DragPayload,
  });
  // Its cost only changes with the action.
  const title = useMemo(
    () =>
      [
        `Drag ${action.label} onto the chart (a click adds it at the end)`,
        ...describeActionCost(
          getActionCost(splitTeamActionId(action.id).characterId, action.id)
        ),
      ].join('\n'),
    [action]
  );
  return (
    <button
      ref={setNodeRef}
      type='button'
      {...listeners}
      {...attributes}
      data-testid={`timeline-add-${action.id}`}
      title={title}
      onClick={onAdd}
      className={cn(
        'flex h-7 cursor-grab touch-none items-center gap-1 rounded-md border border-border bg-muted/60 pr-1.5 pl-0.5 hover:bg-accent/70 active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <GripVertical className='size-3 text-subtle' />
      <RotationActionIcon
        action={action}
        size={18}
        className='bg-transparent p-0 ring-0'
      />
      {action.shortLabel}
    </button>
  );
};

// Drop a block here to remove it; a click removes the one picked.
const Trash = ({
  canRemove,
  onRemove,
}: {
  canRemove: boolean;
  onRemove: () => void;
}) => {
  const { setNodeRef, isOver, active } = useDroppable({ id: TRASH_DROP_ID });
  const dragging = active?.data.current?.kind === 'move';
  return (
    <button
      ref={setNodeRef}
      type='button'
      data-testid='timeline-trash'
      aria-label='Remove the block'
      title='Drop a block here to remove it'
      disabled={!canRemove && !dragging}
      onClick={onRemove}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md border px-2 text-rose-300 disabled:opacity-60',
        isOver && dragging
          ? 'border-rose-400 bg-rose-500/30'
          : dragging
          ? 'border-dashed border-rose-400/70 bg-rose-500/10'
          : 'border-dashed border-input bg-muted/40'
      )}
    >
      <Trash2 className='size-3.5' />
      Trash
    </button>
  );
};

// Edit mode, over the chart. Drag a member's action onto the chart to add
// it where it drops (a click adds it at the end); Dash and Wait, done by
// whoever is on the field, are once in the General group. Drag a block on the
// chart to move it or onto the trash to remove it, and click one to
// change it here (a Normal Attack's hits, a Wait's seconds).
const RotationEditBar = ({
  members,
  actions,
  rotation,
  selected,
  selection = [],
  holdLimit = null,
  onChange,
  onSelect,
  onClearSelection,
}: RotationEditBarProps) => {
  const many = selection.length > 1;
  const removeSelection = () => {
    onChange(removeBlocks(rotation, selection));
    onSelect(null);
  };
  const block = rotation.blocks.find((entry) => entry.uid === selected);
  const nextBlock = block
    ? rotation.blocks[rotation.blocks.indexOf(block) + 1]
    : undefined;
  const action = block
    ? actions.find((entry) => entry.id === block.action)
    : undefined;
  // A block dropped on the trash leaves the rotation.
  useDndMonitor({
    onDragEnd: (event) => {
      const payload = payloadOf(event);
      if (event.over?.id === TRASH_DROP_ID && payload?.kind === 'move') {
        // A block picked with others takes them all.
        if (many && selection.includes(payload.blockUid)) {
          removeSelection();
        } else {
          onChange(removeBlock(rotation, payload.blockUid));
          onSelect(null);
        }
      }
    },
  });

  const drop = (payload: DragPayload, beforeUid: string | null) => {
    const result = applyDrop(rotation, actions, payload, beforeUid);
    onChange(result.rotation);
    onSelect(result.selected);
  };

  return (
    <div
      data-testid='timeline-edit-bar'
      className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card/50 px-3 py-2 text-2xs text-muted-foreground'
    >
      {members.map((member) => (
        <div key={member.characterId} className='flex items-center gap-1'>
          {/* The member's face, ringed in its color (its name on hover). */}
          <span
            title={member.name}
            className={cn('mr-1 shrink-0 rounded-full p-px', member.color.bar)}
          >
            <Avatar
              src={member.avatar}
              alt={member.name}
              size={24}
              shape='circle'
            />
          </span>
          {actions
            .filter(
              (entry) =>
                !entry.hidden &&
                !isFieldAction(entry.id) &&
                // Swaps are the engine's own.
                entry.kind !== 'swap' &&
                splitTeamActionId(entry.id).characterId === member.characterId
            )
            .map((entry) => (
              <PaletteItem
                key={entry.id}
                action={entry}
                onAdd={() => drop({ kind: 'new', actionId: entry.id }, null)}
              />
            ))}
        </div>
      ))}
      <div
        data-testid='timeline-general-actions'
        className='flex items-center gap-1 border-l border-border pl-4'
      >
        <span className='mr-1 font-semibold text-muted-foreground'>
          General
        </span>
        {getGeneralPaletteActions(actions).map((entry) => (
          <PaletteItem
            key={entry.id}
            action={entry}
            onAdd={() => drop({ kind: 'new', actionId: entry.id }, null)}
          />
        ))}
      </div>

      <div className='ml-auto flex items-center gap-2'>
        <SectionHelp section='editBar' />
        <Badge
          variant='muted'
          size='sm'
          data-testid='timeline-block-count'
          title='Blocks in the rotation'
          className='tabular-nums'
        >
          {rotation.blocks.length} blocks
        </Badge>
        {many ? (
          <>
            <span
              data-testid='timeline-selection-count'
              className='font-semibold text-foreground'
            >
              {selection.length} selected
            </span>
            <span className='text-subtle'>drag one to move them together</span>
            <Button
              variant='secondary'
              size='icon-xs'
              aria-label='Clear the selection'
              title='Clear the selection (Esc)'
              onClick={() => onClearSelection?.()}
              className='rounded'
            >
              <X className='size-3.5' />
            </Button>
          </>
        ) : block && action ? (
          <>
            <span className='font-semibold text-foreground'>
              {action.label.replace(/^[^:]+:\s*/, '')}
            </span>
            {/* What it costs: its Energy, cheaper forms, what it needs. */}
            {describeActionCost(
              getActionCost(splitTeamActionId(action.id).characterId, action.id)
            ).map((line) => (
              <Badge
                key={line}
                variant='muted'
                size='sm'
                data-testid='timeline-block-cost'
                className='text-brand-200'
              >
                {line}
              </Badge>
            ))}
            {action.kind === 'normal' && (
              <Stepper
                label='Hits'
                data-testid='timeline-block-hits'
                value={`N${block.hits}`}
                canDecrement={block.hits > 1}
                canIncrement={block.hits < (action.maxHits ?? 1)}
                onDecrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits - 1 })
                  )
                }
                onIncrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits + 1 })
                  )
                }
              />
            )}
            {/* A Charged Attack right after a Dash that follows another
                one (Mavuika's CDC): it can cancel that Dash. The flag is
                the Dash's, the action it cuts short. */}
            {(() => {
              const index = rotation.blocks.indexOf(block);
              const dash = rotation.blocks[index - 1];
              return action.kind === 'charged' &&
                dash &&
                splitTeamActionId(dash.action).actionId === 'dodge' ? (
                <QuickCancelToggle
                  block={dash}
                  previous={rotation.blocks[index - 2]}
                  next={block}
                  onChange={(quickCancel) =>
                    onChange(updateBlock(rotation, dash.uid, { quickCancel }))
                  }
                />
              ) : null;
            })()}
            {/* A held action with a hold time: how long, how it ends. */}
            {action.count?.hold && (
              <HoldControls
                block={playedHold(block, nextBlock, actions)}
                canCancel={cancelsHold(block, nextBlock, actions)}
                hold={action.count.hold}
                limit={holdLimit}
                onChange={(patch) =>
                  onChange(updateBlock(rotation, block.uid, patch))
                }
              />
            )}
            {/* A held action (a Charged Attack's spins): how many. */}
            {action.count && !action.count.hold && (
              <Stepper
                label={action.count.label}
                data-testid='timeline-block-count'
                value={String(block.hits)}
                canDecrement={block.hits > 1}
                canIncrement={block.hits < action.count.max}
                onDecrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits - 1 })
                  )
                }
                onIncrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits + 1 })
                  )
                }
              />
            )}
            {/* An action with a hold (a hold E): one block, Hold on or off. */}
            {action.hold && (
              <button
                type='button'
                data-testid='timeline-block-hold'
                data-state={block.hold ? 'on' : 'off'}
                aria-pressed={Boolean(block.hold)}
                title='Hold the button (the hold version of this action)'
                onClick={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hold: !block.hold })
                  )
                }
                className={TOGGLE}
              >
                Hold
              </button>
            )}
            {action.kind === 'wait' && (
              <Stepper
                label='Seconds'
                data-testid='timeline-block-seconds'
                value={block.seconds.toFixed(1)}
                canDecrement={block.seconds > 0.1}
                onDecrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, {
                      seconds: Math.max(
                        0.1,
                        Math.round((block.seconds - 0.1) * 10) / 10
                      ),
                    })
                  )
                }
                onIncrement={() =>
                  onChange(
                    updateBlock(rotation, block.uid, {
                      seconds: Math.round((block.seconds + 0.1) * 10) / 10,
                    })
                  )
                }
              />
            )}
            <Button
              variant='secondary'
              size='icon-xs'
              aria-label='Unpick the block'
              onClick={() => onSelect(null)}
              className='rounded'
            >
              <X className='size-3.5' />
            </Button>
          </>
        ) : (
          <span className='text-subtle'>
            Click a block to change it · <Kbd>Ctrl</Kbd>/<Kbd>Shift</Kbd> +
            click or <Kbd>Shift</Kbd> + drag to pick several
          </span>
        )}
        {/* A block dropped here leaves the rotation; a click removes the
            one picked. */}
        <Trash
          canRemove={Boolean(block)}
          onRemove={() => {
            if (many) {
              removeSelection();
            } else if (block) {
              onChange(removeBlock(rotation, block.uid));
              onSelect(null);
            }
          }}
        />
      </div>
    </div>
  );
};

// Drawn again only when the rotation, the picked blocks or the team
// change, not as the playhead moves.
export default memo(RotationEditBar);
