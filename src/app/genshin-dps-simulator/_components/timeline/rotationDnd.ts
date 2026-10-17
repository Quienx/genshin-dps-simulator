import { DragEndEvent } from '@dnd-kit/core';

import { DragPayload } from './timelineData';

// Edit mode's drag and drop (dnd-kit): what can be dropped on.
export const TRACKS_DROP_ID = 'timeline-tracks';
export const TRASH_DROP_ID = 'timeline-trash';

// What a drag carries (its draggable's `data`).
export const payloadOf = (
  event: Pick<DragEndEvent, 'active'>
): DragPayload | null =>
  (event.active.data.current as DragPayload | undefined) ?? null;

// Where the pointer is (its clientX), read before dnd-kit's own handlers
// run (capture phase), so a drag's move and end see where it is now. A
// drag's `delta` would not do: dnd-kit adjusts it for scrolled containers.
let pointerX: number | null = null;
let pointerY: number | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { capture: true, passive: true }
  );
}
export const currentPointerX = (): number | null => pointerX;

// The member whose action row is under the pointer (a Dash or Wait dropped
// there is theirs), or null off those rows.
export const memberRowAtPointer = (): string | null => {
  if (pointerX === null || pointerY === null) {
    return null;
  }
  const row = document
    .elementsFromPoint(pointerX, pointerY)
    .map((element) => element.closest<HTMLElement>('[data-row-member]'))
    .find((element) => element !== null);
  return row?.dataset.rowMember ?? null;
};
