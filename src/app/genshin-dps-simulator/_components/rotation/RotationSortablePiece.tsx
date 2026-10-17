import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ComponentProps } from 'react';

import { isPaletteDragId } from './rotationDragIds';
import RotationPiece from './RotationPiece';

type RotationSortablePieceProps = Omit<
  ComponentProps<typeof RotationPiece>,
  'showDropIndicator'
> & {
  onSelectBlock: (uid: string) => void;
};

// The whole piece is the drag handle; a short press (under the sensor's
// distance threshold) selects it instead.
const RotationSortablePiece = ({
  block,
  onSelectBlock,
  ...props
}: RotationSortablePieceProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id: block.uid });
  const isPaletteOver = isOver && isPaletteDragId(active?.id);

  return (
    <RotationPiece
      ref={setNodeRef}
      block={block}
      showDropIndicator={isPaletteOver}
      suppressTooltip={active !== null}
      className={isDragging ? 'z-10 opacity-70 shadow-lg' : 'cursor-grab'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={() => onSelectBlock(block.uid)}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSelectBlock(block.uid);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      {...props}
    />
  );
};

export default RotationSortablePiece;
