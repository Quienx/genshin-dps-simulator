// An action played as a form while a status lasted, then as itself once
// it ended: Mavuika's Charged Attacks after the Flamestrider say so.
import { describe, expect, it } from 'vitest';

import { buildInspectorView } from '../_lib/inspector';
import { buildMemberValues, createTeamBlock, runTeam } from '../_lib/team';

const chargedPieces = (charged: ReturnType<typeof createTeamBlock>[]) =>
  buildInspectorView(
    runTeam(
      {
        members: [buildMemberValues('mavuika'), buildMemberValues('citlali')],
        rotation: {
          loop: false,
          blocks: [
            ...['citlali:skill', 'citlali:burst', 'mavuika:burst'].map((id) =>
              createTeamBlock(id)
            ),
            createTeamBlock('mavuika:dodge'),
            ...charged,
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 12,
      },
      'expected'
    )
  ).actions.filter((action) => action.actionId === 'mavuika:charged');

const check = (pieces: ReturnType<typeof chargedPieces>) => {
  expect(pieces).toHaveLength(9);
  const onBike = pieces.filter(
    (piece) => piece.performedActionId === 'mavuika:flamestriderCharged'
  );
  expect(onBike.length).toBeGreaterThan(0);
  expect(onBike.length).toBeLessThan(9);
  onBike.forEach((piece) => expect(piece.warning).toBeNull());
  pieces
    .slice(onBike.length)
    .forEach((piece) =>
      expect(piece.warning).toBe('Flamestrider ended: a normal Charged Attack')
    );
};

describe('a form whose status ended', () => {
  it('warns on the Charged Attacks played after the Flamestrider (×9)', () => {
    check(
      chargedPieces([{ ...createTeamBlock('mavuika:charged'), repeat: 9 }])
    );
  });

  it('warns on each of 9 Charged blocks after it', () => {
    check(
      chargedPieces(
        Array.from({ length: 9 }, () => createTeamBlock('mavuika:charged'))
      )
    );
  });
});
