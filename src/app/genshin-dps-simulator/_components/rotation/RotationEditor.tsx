import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ReactNode, useId, useState } from 'react';

import { cn } from '@/lib/utils';

import RotationActionIcon from './RotationActionIcon';
import {
  fromPaletteDragId,
  isPaletteDragId,
  TRACK_DROP_ID,
} from './rotationDragIds';
import RotationInspector, { BlockPatch } from './RotationInspector';
import RotationPaletteItem from './RotationPaletteItem';
import RotationTrack from './RotationTrack';
import CharacterAvatar from '../CharacterAvatar';
import { BlockDamage } from '../../_lib/rotation/automaticRotation';
import {
  createBlock,
  findAction,
  insertBlock,
  moveBlock,
  removeBlock,
  updateBlock,
} from '../../_lib/rotation/blocks';
import { BlockMember } from '../../_lib/rotation/memberStyles';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { TimelineLayout } from '../../_lib/rotation/timelineLayout';
import { RotationSetting } from '../../_lib/rotation/types';
import { RotationTraceEntry } from '../../_lib/rotation/types';
import { CooldownTrack } from '../../_lib/types';

type RotationEditorProps = {
  rotation: RotationSetting;
  actions: RotationAction[];
  layout: TimelineLayout;
  duration: number;
  combosByBlock: Record<string, number[]>;
  damageByBlock: Record<string, BlockDamage>;
  // Shown on pieces without DMG (a team before its Simulate run).
  damageNote?: string;
  warningsByBlock: Record<string, string>;
  notesByBlock: Record<string, string>;
  cooldowns: CooldownTrack[];
  trace?: RotationTraceEntry[];
  // A team's palette: one labelled group per member, in its color.
  paletteGroups?: {
    id: string;
    label: string;
    avatar?: string;
    // Classes for the member's name.
    labelClassName?: string;
    actions: RotationAction[];
  }[];
  // A team block's member (color and avatar), by action id.
  memberFor?: (actionId: string) => BlockMember | undefined;
  // A team's pieces show their own member's cooldowns only.
  cooldownsFor?: (actionId: string) => CooldownTrack[];
  // Cut the track into rows of this many seconds.
  rowSeconds?: number;
  // More for a piece's tooltip, from the time it starts and its block.
  pieceExtra?: (start: number, blockUid: string) => ReactNode;
  // Pieces' own details as one line of symbols.
  compactDetails?: boolean;
  onChange: (rotation: RotationSetting) => void;
};

const RotationEditor = ({
  rotation,
  actions,
  layout,
  duration,
  combosByBlock,
  damageByBlock,
  damageNote,
  warningsByBlock,
  notesByBlock,
  cooldowns,
  trace,
  paletteGroups,
  memberFor,
  cooldownsFor,
  rowSeconds,
  pieceExtra,
  compactDetails,
  onChange,
}: RotationEditorProps) => {
  // A stable id keeps dnd-kit's generated aria ids equal on server and client.
  const dndId = useId();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space picks a piece up; Enter is left to select or add it.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space', 'Enter'],
      },
    })
  );

  const selectedBlock =
    rotation.blocks.find((block) => block.uid === selectedUid) ?? null;
  const selectedAction = selectedBlock
    ? findAction(actions, selectedBlock.action) ?? null
    : null;
  const draggedAction =
    draggedId !== null && isPaletteDragId(draggedId)
      ? findAction(actions, fromPaletteDragId(draggedId)) ?? null
      : null;

  const insertAction = (action: RotationAction, beforeUid: string | null) => {
    const block = createBlock(action);
    onChange(insertBlock(rotation, block, beforeUid));
    setSelectedUid(block.uid);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDraggedId(active.id);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedId(null);
    if (!over) {
      return;
    }
    if (isPaletteDragId(active.id)) {
      const action = findAction(actions, fromPaletteDragId(active.id));
      if (action) {
        insertAction(
          action,
          over.id === TRACK_DROP_ID ? null : String(over.id)
        );
      }
      return;
    }
    if (over.id !== TRACK_DROP_ID && active.id !== over.id) {
      onChange(moveBlock(rotation, String(active.id), String(over.id)));
    }
  };

  const handleChange = (uid: string, patch: BlockPatch) =>
    onChange(updateBlock(rotation, uid, patch));

  const handleRemove = (uid: string) => {
    onChange(removeBlock(rotation, uid));
    setSelectedUid(null);
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedId(null)}
    >
      <div className='flex flex-col gap-2'>
        {paletteGroups ? (
          <div data-testid='rotation-palette' className='flex flex-col gap-1.5'>
            {paletteGroups.map((group) => (
              <div
                key={group.id}
                role='group'
                aria-label={`Add an action of ${group.label}`}
                className='flex flex-wrap items-center gap-1.5'
              >
                <span
                  className={cn(
                    'flex w-32 shrink-0 items-center gap-1.5 text-xs font-semibold',
                    group.labelClassName ?? 'text-muted-foreground'
                  )}
                >
                  <CharacterAvatar src={group.avatar} alt='' size={28} />
                  <span className='truncate'>{group.label}</span>
                </span>
                {group.actions.map((action) => (
                  <RotationPaletteItem
                    key={action.id}
                    action={action}
                    chip={memberFor?.(action.id)?.chip}
                    onAdd={(added) => insertAction(added, null)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            data-testid='rotation-palette'
            role='group'
            aria-label='Add an action'
            className='flex flex-wrap gap-1.5'
          >
            {actions
              .filter((action) => !action.hidden)
              .map((action) => (
                <RotationPaletteItem
                  key={action.id}
                  action={action}
                  onAdd={(added) => insertAction(added, null)}
                />
              ))}
          </div>
        )}
        <RotationTrack
          layout={layout}
          blocks={rotation.blocks}
          actions={actions}
          duration={duration}
          combosByBlock={combosByBlock}
          damageByBlock={damageByBlock}
          damageNote={damageNote}
          warningsByBlock={warningsByBlock}
          notesByBlock={notesByBlock}
          selectedUid={selectedUid}
          cooldowns={cooldowns}
          cooldownsFor={cooldownsFor}
          rowSeconds={rowSeconds}
          pieceExtra={pieceExtra}
          compactDetails={compactDetails}
          memberFor={memberFor}
          trace={trace}
          onSelect={setSelectedUid}
        />
        <RotationInspector
          block={selectedBlock}
          action={selectedAction}
          warning={
            selectedBlock ? warningsByBlock[selectedBlock.uid] ?? null : null
          }
          canDashCancel={actions.some((action) => action.kind === 'dodge')}
          onChange={handleChange}
          onRemove={handleRemove}
        />
      </div>
      <DragOverlay>
        {draggedAction && (
          <RotationActionIcon action={draggedAction} size={32} />
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default RotationEditor;
