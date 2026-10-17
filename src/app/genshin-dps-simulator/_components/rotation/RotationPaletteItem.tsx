import { useDraggable } from '@dnd-kit/core';

import { cn } from '@/lib/utils';

import RotationActionIcon from './RotationActionIcon';
import { toPaletteDragId } from './rotationDragIds';
import { KIND_STYLES } from '../../_lib/rotation/kindStyles';
import { RotationAction } from '../../_lib/rotation/rotationSchema';

type RotationPaletteItemProps = {
  action: RotationAction;
  onAdd: (action: RotationAction) => void;
  // A team member's color instead of the kind's (the kind becomes a stripe).
  chip?: string;
};

// Drag onto the timeline to insert it there, or click to add it at the end.
const RotationPaletteItem = ({
  action,
  onAdd,
  chip,
}: RotationPaletteItemProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: toPaletteDragId(action.id),
  });

  return (
    <button
      ref={setNodeRef}
      type='button'
      data-testid={`rotation-add-${action.id}`}
      title={[action.label, action.description].filter(Boolean).join(': ')}
      onClick={() => onAdd(action)}
      className={cn(
        'relative flex cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        chip ?? KIND_STYLES[action.kind].chip,
        chip && 'pb-1.5',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      {chip && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 bottom-0 h-[3px]',
            KIND_STYLES[action.kind].bar
          )}
        />
      )}
      <RotationActionIcon action={action} size={22} />
      <kbd
        aria-hidden
        className='rounded-[3px] border border-current/40 bg-background/60 px-1 font-sans font-bold'
      >
        {action.shortLabel}
      </kbd>
      <span className='sr-only'>{`Add ${action.label}`}</span>
    </button>
  );
};

export default RotationPaletteItem;
