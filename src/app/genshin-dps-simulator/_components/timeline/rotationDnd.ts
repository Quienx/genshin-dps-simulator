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
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointerX = event.clientX;
    },
    { capture: true, passive: true }
  );
}
export const currentPointerX = (): number | null => pointerX;
