// The Selected Event's pin names a rotation block (and which of its plays
// and hits), so it survives the re-run every edit makes.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import {
  hitsOfAction,
  pinOf,
  resolvePin,
  shownEvent,
} from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import { removeBlock, updateBlock } from '../_lib/rotation/blocks';
import { RotationSetting } from '../_lib/rotation/types';
import { buildMemberValues, runOwnRotation } from '../_lib/team';

const viewOf = (rotation: RotationSetting) =>
  buildInspectorView(
    runOwnRotation(
      {
        members: [buildMemberValues('nicole')],
        rotation,
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    )
  );

const start: RotationSetting = {
  loop: false,
  blocks: [
    block('e', 'nicole:skill'),
    block('wait', 'nicole:wait', { seconds: 1 }),
    block('na', 'nicole:normal', { hits: 3 }),
  ],
};

const pieceOf = (view: ReturnType<typeof viewOf>, uid: string, turn = 0) =>
  view.actions.filter((action) => action.blockUid === uid)[turn];

describe('the Selected Event pin', () => {
  it("keeps a Wait's event when its seconds change", () => {
    const before = viewOf(start);
    const pin = pinOf(before, pieceOf(before, 'wait'), null);
    const after = viewOf(updateBlock(start, 'wait', { seconds: 1.1 }));
    const resolved = resolvePin(after, pin);
    expect(resolved?.action.blockUid).toBe('wait');
  });

  it("keeps a later block's play and hit when a block is added before it", () => {
    const before = viewOf(start);
    const n2 = pieceOf(before, 'na', 1);
    const hit = hitsOfAction(before, n2)[0];
    const pin = pinOf(before, n2, hit);
    const after = viewOf({
      ...start,
      blocks: [block('first', 'nicole:normal'), ...start.blocks],
    });
    const resolved = resolvePin(after, pin);
    expect(resolved?.action.blockUid).toBe('na');
    expect(resolved?.action.comboIndex).toBe(n2.comboIndex);
    expect(resolved?.hit?.blockUid).toBe('na');
    expect(resolved?.hit?.time).toBeGreaterThan(hit.time);
  });

  it('lets go when its block is removed', () => {
    const before = viewOf(start);
    const pin = pinOf(before, pieceOf(before, 'wait'), null);
    expect(resolvePin(viewOf(removeBlock(start, 'wait')), pin)).toBeNull();
  });

  it('keeps a pinned event while other blocks are picked', () => {
    const view = viewOf(start);
    const pin = pinOf(view, pieceOf(view, 'e'), null);
    // Picking the Wait (to change its seconds) leaves the pin alone.
    expect(shownEvent(view, pin, 'wait')?.action.blockUid).toBe('e');
  });

  it('shows the picked block when nothing is pinned', () => {
    const view = viewOf(start);
    expect(shownEvent(view, null, 'wait')?.action.blockUid).toBe('wait');
    expect(shownEvent(view, null, null)).toBeNull();
  });
});
