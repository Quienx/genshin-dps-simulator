import { useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Minus, Plus, Trash2, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { payloadOf, TRASH_DROP_ID } from './rotationDnd';
import { TimelineMember } from './TimelineChart';
import { applyDrop, DragPayload } from './timelineData';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { splitTeamActionId } from '../../_lib/engine/simulateTeam';
import { removeBlock, updateBlock } from '../../_lib/rotation/blocks';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { RotationSetting } from '../../_lib/rotation/types';

type RotationEditBarProps = {
  members: TimelineMember[];
  // Every member's actions (team ids, "arlecchino:normal").
  actions: RotationAction[];
  rotation: RotationSetting;
  selected: string | null;
  onChange: (rotation: RotationSetting) => void;
  onSelect: (blockUid: string | null) => void;
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
      title={`Drag ${action.label} onto the chart (a click adds it at the end)`}
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
// it where it drops (a click adds it at the end), drag a block on the
// chart to move it or onto the trash to remove it, and click one to
// change it here (a Normal Attack's hits, a Wait's seconds).
const RotationEditBar = ({
  members,
  actions,
  rotation,
  selected,
  onChange,
  onSelect,
}: RotationEditBarProps) => {
  const block = rotation.blocks.find((entry) => entry.uid === selected);
  const action = block
    ? actions.find((entry) => entry.id === block.action)
    : undefined;
  // A block dropped on the trash leaves the rotation.
  useDndMonitor({
    onDragEnd: (event) => {
      const payload = payloadOf(event);
      if (event.over?.id === TRASH_DROP_ID && payload?.kind === 'move') {
        onChange(removeBlock(rotation, payload.blockUid));
        onSelect(null);
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
          <span className={cn('mr-1 font-semibold', member.color.text)}>
            {member.name}
          </span>
          {actions
            .filter(
              (entry) =>
                !entry.hidden &&
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

      <div className='ml-auto flex items-center gap-2'>
        {block && action ? (
          <>
            <span className='font-semibold text-slate-100'>
              {action.label.replace(/^[^:]+:\s*/, '')}
            </span>
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
            Click a block on the chart to change it
          </span>
        )}
        {/* A block dropped here leaves the rotation; a click removes the
            one picked. */}
        <Trash
          canRemove={Boolean(block)}
          onRemove={() => {
            if (block) {
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
