import { UniqueIdentifier } from '@dnd-kit/core';

// Palette items and timeline pieces share one DndContext; palette ids carry
// a prefix so a drop can tell "add a new action" from "move a block".
const PALETTE_PREFIX = 'palette:';

export const TRACK_DROP_ID = 'rotation-track';

export const toPaletteDragId = (actionId: string): string =>
  `${PALETTE_PREFIX}${actionId}`;

export const isPaletteDragId = (id: UniqueIdentifier | undefined): boolean =>
  typeof id === 'string' && id.startsWith(PALETTE_PREFIX);

export const fromPaletteDragId = (id: UniqueIdentifier): string =>
  String(id).slice(PALETTE_PREFIX.length);
