import { useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { payloadOf, TRASH_DROP_ID } from './rotationDnd';
import SectionHelp from './SectionHelp';
import { TimelineMember } from './TimelineChart';
import { applyDrop, DragPayload } from './timelineData';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { describeActionCost, getActionCost } from '../../_lib/actionCosts';
import {
  isFieldAction,
  splitTeamActionId,
} from '../../_lib/engine/simulateTeam';
import {
  chargesIn,
  heldFramesOf,
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
  onChange: (rotation: RotationSetting) => void;
  onSelect: (blockUid: string | null) => void;
  onClearSelection?: () => void;
};

const STEP_BUTTON =
  'flex size-6 items-center justify-center rounded border border-slate-700/60 bg-slate-800/60 text-slate-200 hover:bg-slate-700/70 disabled:opacity-40';

// A number the block picked holds (a Normal Attack's hits, a Wait's
// seconds), with − and +.
const Stepper = ({
  label,
  value,
  testId,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
}: {
  label: string;
  value: string;
  testId: string;
  onLess: () => void;
  onMore: () => void;
  lessDisabled?: boolean;
  moreDisabled?: boolean;
}) => (
  <span className='flex items-center gap-1'>
    {label}
    <button
      type='button'
      aria-label={`${label}: less`}
      data-testid={`${testId}-less`}
      disabled={lessDisabled}
      onClick={onLess}
      className={STEP_BUTTON}
    >
      <Minus className='size-3' />
    </button>
    <span
      data-testid={testId}
      className='w-8 text-center font-mono text-slate-100'
    >
      {value}
    </span>
    <button
      type='button'
      aria-label={`${label}: more`}
      data-testid={`${testId}-more`}
      disabled={moreDisabled}
      onClick={onMore}
      className={STEP_BUTTON}
    >
      <Plus className='size-3' />
    </button>
  </span>
);

// A held action with a hold time (Mavuika's Flamestrider Charged
// Attack): how long, in seconds, and how many charges (repeated hits) that
// gets; Prev / Next charge move it to the charge before or after.
const HoldControls = ({
  block,
  hold,
  onChange,
}: {
  block: RotationBlock;
  hold: NonNullable<NonNullable<RotationAction['count']>['hold']>;
  onChange: (patch: Partial<RotationBlock>) => void;
}) => {
  const frames = heldFramesOf(block, hold);
  const charges = chargesIn(frames, hold);
  const [text, setText] = useState<string | null>(null);
  const setFrames = (next: number) =>
    onChange({
      heldSeconds:
        Math.min(hold.maxFrames, Math.max(hold.minFrames, Math.round(next))) /
        60,
    });
  // The frame of charge `n` (1 = the first).
  const chargeFrame = (n: number) =>
    hold.firstHitFrame + (n - 1) * hold.hitEveryFrames;
  const canNext = chargeFrame(charges + 1) <= hold.maxFrames;
  const maxCharges = chargesIn(hold.maxFrames, hold);
  const canPrev = charges > 1;
  return (
    <span className='flex items-center gap-1'>
      <button
        type='button'
        data-testid='timeline-block-charge-prev'
        title='Hold until the charge before'
        disabled={!canPrev}
        onClick={() => setFrames(chargeFrame(charges - 1))}
        className='flex h-6 items-center gap-0.5 rounded border border-slate-700/60 bg-slate-800/60 px-1.5 text-slate-200 hover:bg-slate-700/70 disabled:opacity-40'
      >
        <ChevronLeft className='size-3' />
        Prev charge
      </button>
      <input
        type='number'
        aria-label='Hold (seconds)'
        data-testid='timeline-block-held'
        value={text ?? (frames / 60).toFixed(2)}
        min={hold.minFrames / 60}
        max={hold.maxFrames / 60}
        step={0.01}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = Number(text);
          if (text !== null && Number.isFinite(next)) {
            setFrames(next * 60);
          }
          setText(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className='h-6 w-14 [appearance:textfield] rounded border border-slate-700/60 bg-slate-950/60 px-1 text-center font-mono text-[11px] text-slate-100 focus:border-sky-500 focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
      />
      s
      <button
        type='button'
        data-testid='timeline-block-charge-next'
        title='Hold until the next charge'
        disabled={!canNext}
        onClick={() => setFrames(chargeFrame(charges + 1))}
        className='flex h-6 items-center gap-0.5 rounded border border-slate-700/60 bg-slate-800/60 px-1.5 text-slate-200 hover:bg-slate-700/70 disabled:opacity-40'
      >
        Next charge
        <ChevronRight className='size-3' />
      </button>
      {/* How many charges: the tag opens a list to hold until one. */}
      <Menu.Root>
        <Menu.Trigger asChild>
          <button
            type='button'
            aria-label='Charges'
            data-testid='timeline-block-charges'
            className='ml-1 rounded bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-100 outline-none hover:bg-sky-500/30 focus-visible:ring-1 focus-visible:ring-sky-400'
          >
            {charges} {charges === 1 ? 'charge' : 'charges'}
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align='start'
            sideOffset={4}
            className='z-50 min-w-28 rounded-md border border-slate-700 bg-slate-900 p-1 text-[11px] text-slate-100 shadow-xl'
          >
            {Array.from({ length: maxCharges }, (_, index) => index + 1).map(
              (n) => (
                <Menu.Item
                  key={n}
                  data-testid={`timeline-block-charges-${n}`}
                  onSelect={() => setFrames(chargeFrame(n))}
                  className={cn(
                    'cursor-pointer rounded px-2 py-1 outline-none select-none data-[highlighted]:bg-slate-800',
                    n === charges && 'text-sky-200'
                  )}
                >
                  {n} {n === 1 ? 'charge' : 'charges'}
                </Menu.Item>
              )
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <button
        type='button'
        data-testid='timeline-block-keep-final'
        aria-pressed={block.keepFinal === true}
        title='Always release for the Final hit, even with a Dash next (else the Dash cancels the spin)'
        onClick={() => onChange({ keepFinal: !block.keepFinal })}
        className={cn(
          'ml-2 rounded border px-2 py-0.5',
          block.keepFinal
            ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
            : 'border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/70'
        )}
      >
        Final hit
      </button>
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
  return (
    <button
      ref={setNodeRef}
      type='button'
      {...listeners}
      {...attributes}
      data-testid={`timeline-add-${action.id}`}
      title={[
        `Drag ${action.label} onto the chart (a click adds it at the end)`,
        ...describeActionCost(
          getActionCost(splitTeamActionId(action.id).characterId, action.id)
        ),
      ].join('\n')}
      onClick={onAdd}
      className={cn(
        'flex h-7 cursor-grab touch-none items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/60 pr-1.5 pl-0.5 hover:bg-slate-700/70 active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <GripVertical className='size-3 text-slate-500' />
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
          : 'border-dashed border-slate-600 bg-slate-800/40'
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
      className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-700/60 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-300'
    >
      {members.map((member) => (
        <div key={member.characterId} className='flex items-center gap-1'>
          {/* The member's face, ringed in its color (its name on hover). */}
          <span
            title={member.name}
            className={cn('mr-1 shrink-0 rounded-full p-px', member.color.bar)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={member.avatar}
              alt={member.name}
              width={24}
              height={24}
              className='size-6 rounded-full bg-slate-700'
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
        className='flex items-center gap-1 border-l border-slate-700/60 pl-4'
      >
        <span className='mr-1 font-semibold text-slate-300'>General</span>
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
        <span
          data-testid='timeline-block-count'
          title='Blocks in the rotation'
          className='rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-400 tabular-nums'
        >
          {rotation.blocks.length} blocks
        </span>
        {many ? (
          <>
            <span
              data-testid='timeline-selection-count'
              className='font-semibold text-slate-100'
            >
              {selection.length} selected
            </span>
            <span className='text-slate-500'>
              drag one to move them together
            </span>
            <button
              type='button'
              aria-label='Clear the selection'
              title='Clear the selection (Esc)'
              onClick={() => onClearSelection?.()}
              className={STEP_BUTTON}
            >
              <X className='size-3.5' />
            </button>
          </>
        ) : block && action ? (
          <>
            <span className='font-semibold text-slate-100'>
              {action.label.replace(/^[^:]+:\s*/, '')}
            </span>
            {/* What it costs: its Energy, cheaper forms, what it needs. */}
            {describeActionCost(
              getActionCost(splitTeamActionId(action.id).characterId, action.id)
            ).map((line) => (
              <span
                key={line}
                data-testid='timeline-block-cost'
                className='rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-sky-200'
              >
                {line}
              </span>
            ))}
            {action.kind === 'normal' && (
              <Stepper
                label='Hits'
                testId='timeline-block-hits'
                value={`N${block.hits}`}
                lessDisabled={block.hits <= 1}
                moreDisabled={block.hits >= (action.maxHits ?? 1)}
                onLess={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits - 1 })
                  )
                }
                onMore={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits + 1 })
                  )
                }
              />
            )}
            {/* A held action with a hold time: how long, how it ends. */}
            {action.count?.hold && (
              <HoldControls
                block={block}
                hold={action.count.hold}
                onChange={(patch) =>
                  onChange(updateBlock(rotation, block.uid, patch))
                }
              />
            )}
            {/* A held action (a Charged Attack's spins): how many. */}
            {action.count && !action.count.hold && (
              <Stepper
                label={action.count.label}
                testId='timeline-block-count'
                value={String(block.hits)}
                lessDisabled={block.hits <= 1}
                moreDisabled={block.hits >= action.count.max}
                onLess={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hits: block.hits - 1 })
                  )
                }
                onMore={() =>
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
                aria-pressed={Boolean(block.hold)}
                title='Hold the button (the hold version of this action)'
                onClick={() =>
                  onChange(
                    updateBlock(rotation, block.uid, { hold: !block.hold })
                  )
                }
                className={cn(
                  'rounded border px-2 py-0.5',
                  block.hold
                    ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/70'
                )}
              >
                Hold
              </button>
            )}
            {action.kind === 'wait' && (
              <Stepper
                label='Seconds'
                testId='timeline-block-seconds'
                value={block.seconds.toFixed(1)}
                lessDisabled={block.seconds <= 0.1}
                onLess={() =>
                  onChange(
                    updateBlock(rotation, block.uid, {
                      seconds: Math.max(
                        0.1,
                        Math.round((block.seconds - 0.1) * 10) / 10
                      ),
                    })
                  )
                }
                onMore={() =>
                  onChange(
                    updateBlock(rotation, block.uid, {
                      seconds: Math.round((block.seconds + 0.1) * 10) / 10,
                    })
                  )
                }
              />
            )}
            <button
              type='button'
              aria-label='Unpick the block'
              onClick={() => onSelect(null)}
              className={STEP_BUTTON}
            >
              <X className='size-3.5' />
            </button>
          </>
        ) : (
          <span className='text-slate-500'>
            Click a block to change it · Ctrl/Shift + click or Shift + drag to
            pick several
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

export default RotationEditBar;
