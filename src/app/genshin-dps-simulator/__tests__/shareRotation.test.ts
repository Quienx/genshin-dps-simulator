// Sharing a team with a friend: the code, the link and the file all bring
// back the same team, builds and rotation.
import { describe, expect, it } from 'vitest';

import {
  decodeSharedRotation,
  encodeSharedRotation,
  SharedRotation,
  shareLink,
  toSharedJson,
} from '../_components/timeline/shareRotation';
import { toTeamActionId } from '../_lib/engine/simulateTeam';
import { buildMemberValues } from '../_lib/team';

const shared: SharedRotation = {
  scenario: 'custom:mavuika,citlali',
  builds: [
    {
      ...buildMemberValues('mavuika'),
      numbers: {
        ...buildMemberValues('mavuika').numbers,
        startingFightingSpirit: '120',
      },
    },
    buildMemberValues('citlali'),
  ],
  setup: {
    rotation: {
      loop: false,
      blocks: [
        {
          uid: 'b1',
          action: toTeamActionId('citlali', 'skill'),
          hits: 1,
          repeat: 1,
          seconds: 0,
          dashCancel: false,
        },
        {
          uid: 'b2',
          action: toTeamActionId('mavuika', 'skill'),
          hits: 1,
          repeat: 1,
          seconds: 0,
          dashCancel: false,
          hold: true,
        },
      ],
    },
    fillWhileWaiting: false,
    swapDelayFrames: 12,
    auras: true,
  },
};

describe('a shared rotation', () => {
  it('comes back from its code as it was', async () => {
    const code = await encodeSharedRotation(shared);
    expect(code.startsWith('gsim1.')).toBe(true);
    // Compressed: shorter than its JSON.
    expect(code.length).toBeLessThan(JSON.stringify(shared).length);
    expect(await decodeSharedRotation(code)).toEqual(shared);
  });

  it('comes back from a link and from the downloaded file', async () => {
    const code = await encodeSharedRotation(shared);
    const link = shareLink(code, 'https://example.com/?team=solo:nicole#x');
    expect(new URL(link).searchParams.get('team')).toBeNull();
    expect(await decodeSharedRotation(link)).toEqual(shared);
    expect(await decodeSharedRotation(toSharedJson(shared))).toEqual(shared);
  });

  it('keeps the team’s own rotation as no rotation', async () => {
    const plain = { ...shared, setup: null };
    expect(
      await decodeSharedRotation(await encodeSharedRotation(plain))
    ).toEqual(plain);
  });

  it('says what is wrong with what was pasted', async () => {
    await expect(decodeSharedRotation('  ')).rejects.toThrow('Paste a code');
    await expect(decodeSharedRotation('hello')).rejects.toThrow(
      'not a rotation code'
    );
    await expect(
      decodeSharedRotation('https://example.com/?team=mavuika')
    ).rejects.toThrow('no shared rotation');
    const code = await encodeSharedRotation(shared);
    await expect(decodeSharedRotation(code.slice(0, 40))).rejects.toThrow(
      'incomplete or damaged'
    );
    await expect(
      decodeSharedRotation(JSON.stringify({ version: 2 }))
    ).rejects.toThrow('could not be read');
  });
});
