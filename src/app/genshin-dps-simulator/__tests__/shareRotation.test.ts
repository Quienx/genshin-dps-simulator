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

// Block ids are not shared: a loaded rotation gets new ones.
const withoutIds = (rotation: SharedRotation) => ({
  ...rotation,
  setup: rotation.setup && {
    ...rotation.setup,
    rotation: {
      ...rotation.setup.rotation,
      blocks: rotation.setup.rotation.blocks.map(({ uid: _uid, ...block }) => ({
        ...block,
      })),
    },
  },
});

// A first-version code: the readable form, compressed.
const oldCode = async (rotation: SharedRotation) => {
  const json = new TextEncoder().encode(
    JSON.stringify({ version: 1, ...rotation })
  );
  const bytes = new Uint8Array(
    await new Response(
      new Blob([json])
        .stream()
        .pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer()
  );
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `gsim1.${btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`;
};

describe('a shared rotation', () => {
  it('comes back from its code as it was', async () => {
    const code = await encodeSharedRotation(shared);
    expect(code.startsWith('gsim2.')).toBe(true);
    expect(withoutIds(await decodeSharedRotation(code))).toEqual(
      withoutIds(shared)
    );
  });

  it('keeps only what differs from the defaults: a short code', async () => {
    // Builds as the defaults but one number, blocks as new ones but a few
    // fields: far shorter than the first version's code.
    const code = await encodeSharedRotation(shared);
    expect(code.length).toBeLessThan((await oldCode(shared)).length / 3);
  });

  it('still opens a first-version code', async () => {
    expect(await decodeSharedRotation(await oldCode(shared))).toEqual(shared);
  });

  it('comes back from a link and from the downloaded file', async () => {
    const code = await encodeSharedRotation(shared);
    const link = shareLink(code, 'https://example.com/?team=solo:nicole#x');
    expect(new URL(link).searchParams.get('team')).toBeNull();
    expect(withoutIds(await decodeSharedRotation(link))).toEqual(
      withoutIds(shared)
    );
    expect(await decodeSharedRotation(toSharedJson(shared))).toEqual(shared);
  });

  it('keeps the team’s own rotation as no rotation', async () => {
    const plain = { ...shared, setup: null };
    expect(
      await decodeSharedRotation(await encodeSharedRotation(plain))
    ).toEqual(plain);
  });

  it('keeps every block field it changed', async () => {
    const block = {
      uid: 'b9',
      action: toTeamActionId('mavuika', 'charged'),
      hits: 3,
      repeat: 2,
      seconds: 0.5,
      dashCancel: true,
      hold: true,
      heldSeconds: 1.62,
      noFinal: true,
      quickCancel: true,
    };
    const full: SharedRotation = {
      ...shared,
      setup: shared.setup && {
        ...shared.setup,
        rotation: { loop: true, blocks: [block] },
        fillWhileWaiting: true,
        swapDelayFrames: 0,
        auras: false,
      },
    };
    expect(
      withoutIds(await decodeSharedRotation(await encodeSharedRotation(full)))
    ).toEqual(withoutIds(full));
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
