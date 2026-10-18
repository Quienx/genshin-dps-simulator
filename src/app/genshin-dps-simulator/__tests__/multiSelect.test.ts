// Edit mode with several blocks picked: they move, and go, together.
import { describe, expect, it } from 'vitest';

import { applyDrop } from '../_components/timeline/timelineData';
import { removeBlocks, selectRange } from '../_lib/rotation/blocks';
import { createTeamBlock, getTeamActions } from '../_lib/team';

const actions = getTeamActions(['arlecchino']);
const [a, b, c, d, e] = ['skill', 'normal', 'charged', 'burst', 'dodge'].map(
  (action) => createTeamBlock(`arlecchino:${action}`)
);
const rotation = { loop: false, blocks: [a, b, c, d, e] };
const order = (result: { blocks: { uid: string }[] }) =>
  result.blocks.map(
    (block) => [a, b, c, d, e].findIndex((entry) => entry.uid === block.uid) + 1
  );
const move = (uids: string[], beforeUid: string | null) =>
  applyDrop(
    rotation,
    actions,
    { kind: 'move', blockUid: uids[0], blockUids: uids },
    beforeUid
  );

describe('moving several picked blocks', () => {
  it('keeps their order and lands them before the drop point', () => {
    expect(order(move([b.uid, c.uid], e.uid).rotation)).toEqual([
      1, 4, 2, 3, 5,
    ]);
    expect(order(move([d.uid, e.uid], a.uid).rotation)).toEqual([
      4, 5, 1, 2, 3,
    ]);
    expect(order(move([a.uid, b.uid], null).rotation)).toEqual([3, 4, 5, 1, 2]);
  });

  it('gathers blocks picked apart, in rotation order', () => {
    // Picked in another order than the rotation's: the rotation's wins.
    expect(order(move([d.uid, a.uid], c.uid).rotation)).toEqual([
      2, 1, 4, 3, 5,
    ]);
  });

  it('leaves the rotation as it was when dropped on itself', () => {
    expect(move([b.uid, c.uid], b.uid).rotation).toBe(rotation);
    expect(move([b.uid, c.uid], c.uid).rotation).toBe(rotation);
    // Right after the group: where it already is.
    expect(move([b.uid, c.uid], d.uid).rotation).toBe(rotation);
  });

  it('dropped on one of them, lands before the next block that is not', () => {
    // A gathered pair dropped on its second block.
    expect(order(move([a.uid, c.uid], c.uid).rotation)).toEqual([
      2, 1, 3, 4, 5,
    ]);
  });

  it('keeps the dragged block as the one picked', () => {
    expect(
      applyDrop(
        rotation,
        actions,
        { kind: 'move', blockUid: c.uid, blockUids: [b.uid, c.uid] },
        e.uid
      ).selected
    ).toBe(c.uid);
  });

  it('adds no Swap when the group lands after another member', () => {
    const team = getTeamActions(['nicole', 'chevreuse']);
    const blocks = [
      createTeamBlock('nicole:skill'),
      createTeamBlock('chevreuse:skill'),
      createTeamBlock('chevreuse:burst'),
      createTeamBlock('nicole:burst'),
    ];
    const result = applyDrop(
      { loop: false, blocks },
      team,
      {
        kind: 'move',
        blockUid: blocks[1].uid,
        blockUids: [blocks[1].uid, blocks[2].uid],
      },
      null
    );

    expect(result.rotation.blocks.map((block) => block.action)).toEqual([
      'nicole:skill',
      'nicole:burst',
      'chevreuse:skill',
      'chevreuse:burst',
    ]);
  });
});

describe('removing and picking several blocks', () => {
  it('removes every picked block', () => {
    expect(order(removeBlocks(rotation, [a.uid, d.uid]))).toEqual([2, 3, 5]);
  });

  it('picks the range from the last one picked, both ways', () => {
    expect(selectRange(rotation, b.uid, d.uid)).toEqual([b.uid, c.uid, d.uid]);
    expect(selectRange(rotation, d.uid, b.uid)).toEqual([b.uid, c.uid, d.uid]);
    expect(selectRange(rotation, null, c.uid)).toEqual([c.uid]);
  });
});
