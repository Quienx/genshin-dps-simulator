import { z } from 'zod';

import { RotationBlock, RotationSetting } from '../../_lib/rotation/types';
import { buildMemberValues, DEFAULT_SWAP_DELAY_FRAMES } from '../../_lib/team';
import { SimulationValues } from '../../_lib/types';

// A team to share with a friend: which team (the scenario), each member's
// build, and the rotation of one's own (null: the scenario's own). It
// travels as a short code (compressed JSON), a link carrying that code, or
// a readable JSON file.
export type SharedRotation = {
  scenario: string;
  builds: SimulationValues[];
  setup: {
    rotation: RotationSetting;
    fillWhileWaiting: boolean;
    swapDelayFrames: number;
    auras?: boolean;
  } | null;
};

// The code starts with this, so a pasted one is told apart from JSON. It
// holds the compact form (version 2); codes of the first one (`gsim1.`, the
// readable form compressed) still open.
const CODE_PREFIX = 'gsim2.';
const OLD_CODE_PREFIX = 'gsim1.';
// The link's query parameter.
export const SHARE_PARAM = 'share';

const blockSchema = z.object({
  uid: z.string(),
  action: z.string(),
  hits: z.number().int().min(1),
  repeat: z.number().int().min(1),
  seconds: z.number().min(0),
  dashCancel: z.boolean(),
  hold: z.boolean().optional(),
  heldSeconds: z.number().min(0).optional(),
  noFinal: z.boolean().optional(),
  quickCancel: z.boolean().optional(),
});

const rotationSchema = z.object({
  loop: z.boolean(),
  blocks: z.array(blockSchema),
});

// Loose on what a build holds (the app fills in what is missing from the
// character's defaults), strict on its shape.
const buildSchema = z.object({
  character: z.string(),
  numbers: z.record(z.string()),
  flags: z.record(z.boolean()),
  rotation: rotationSchema.nullable().optional(),
  artifacts: z
    .object({
      enabled: z.boolean(),
      pieces: z.record(z.unknown()),
    })
    .optional(),
  weapon: z.string().optional(),
  artifactSet: z.string().optional(),
});

const sharedSchema = z.object({
  version: z.literal(1),
  scenario: z.string(),
  builds: z.array(buildSchema).min(1).max(4),
  setup: z
    .object({
      rotation: rotationSchema,
      fillWhileWaiting: z.boolean(),
      swapDelayFrames: z.number().min(0),
      auras: z.boolean().optional(),
    })
    .nullable(),
});

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const pipeThrough = async (
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> =>
  new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(stream)
    ).arrayBuffer()
  );

// The readable form (the downloaded file).
export const toSharedJson = (shared: SharedRotation): string =>
  JSON.stringify({ version: 1, ...shared }, null, 2);

// The compact form (version 2), for codes and links: only what differs
// from what the app would fill in. A build is its character and what it
// changed from that character's defaults; a block, its action and what it
// changed from a new block's (no id: one is made when it is loaded).
type PackedBlock = string | [string, Record<string, number>];
type PackedBuild = string | [string, Record<string, unknown>];
type Packed = {
  v: 2;
  s: string;
  b: PackedBuild[];
  // The rotation of one's own: its blocks, and how it plays when not as
  // usual (l: loop, f: fill while waiting, d: swap delay, a: auras).
  p?: [PackedBlock[], Record<string, number>];
};

const changedFrom = <T>(
  value: Record<string, T>,
  base: Record<string, T>
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(value).filter(([key, entry]) => base[key] !== entry)
  );

const sameJson = (first: unknown, second: unknown) =>
  JSON.stringify(first ?? null) === JSON.stringify(second ?? null);

const packBuild = (build: SimulationValues): PackedBuild => {
  const base = buildMemberValues(build.character);
  const packed: Record<string, unknown> = {};
  const numbers = changedFrom(build.numbers, base.numbers);
  const flags = changedFrom(build.flags, base.flags);
  if (Object.keys(numbers).length > 0) {
    packed.n = numbers;
  }
  if (Object.keys(flags).length > 0) {
    packed.f = flags;
  }
  if (!sameJson(build.rotation, base.rotation)) {
    packed.r = build.rotation ?? null;
  }
  if (!sameJson(build.artifacts, base.artifacts)) {
    packed.a = build.artifacts ?? null;
  }
  if (build.weapon !== base.weapon) {
    packed.w = build.weapon ?? null;
  }
  if (build.artifactSet !== base.artifactSet) {
    packed.x = build.artifactSet ?? null;
  }
  return Object.keys(packed).length > 0
    ? [build.character, packed]
    : build.character;
};

const unpackBuild = (packed: PackedBuild): SimulationValues => {
  const [character, changes] =
    typeof packed === 'string' ? [packed, {}] : packed;
  const base = buildMemberValues(character);
  const { n, f, r, a, w, x } = changes as Record<string, unknown>;
  return {
    ...base,
    numbers: { ...base.numbers, ...((n as Record<string, string>) ?? {}) },
    flags: { ...base.flags, ...((f as Record<string, boolean>) ?? {}) },
    ...(r === undefined ? {} : { rotation: r as RotationSetting | null }),
    ...(a === undefined
      ? {}
      : { artifacts: (a ?? undefined) as SimulationValues['artifacts'] }),
    ...(w === undefined ? {} : { weapon: (w ?? undefined) as string }),
    ...(x === undefined ? {} : { artifactSet: (x ?? undefined) as string }),
  };
};

// A new block's values (createTeamBlock): only the others are kept.
const packBlock = (block: RotationBlock): PackedBlock => {
  const changes: Record<string, number> = {};
  if (block.hits !== 1) changes.h = block.hits;
  if (block.repeat !== 1) changes.r = block.repeat;
  if (block.seconds !== 1) changes.s = block.seconds;
  if (block.dashCancel) changes.d = 1;
  if (block.hold) changes.o = 1;
  if (block.heldSeconds !== undefined) changes.t = block.heldSeconds;
  if (block.noFinal) changes.n = 1;
  if (block.quickCancel) changes.q = 1;
  return Object.keys(changes).length > 0
    ? [block.action, changes]
    : block.action;
};

const unpackBlock = (packed: PackedBlock, index: number): RotationBlock => {
  const [action, changes] = typeof packed === 'string' ? [packed, {}] : packed;
  const { h, r, s, d, o, t, n, q } = changes as Record<string, number>;
  return {
    uid: `shared-${index + 1}`,
    action,
    hits: h ?? 1,
    repeat: r ?? 1,
    seconds: s ?? 1,
    dashCancel: d === 1,
    ...(o === 1 ? { hold: true } : {}),
    ...(t === undefined ? {} : { heldSeconds: t }),
    ...(n === 1 ? { noFinal: true } : {}),
    ...(q === 1 ? { quickCancel: true } : {}),
  };
};

const pack = (shared: SharedRotation): Packed => {
  const { setup } = shared;
  const options: Record<string, number> = {};
  if (setup?.rotation.loop) options.l = 1;
  if (setup?.fillWhileWaiting) options.f = 1;
  if (setup && setup.swapDelayFrames !== DEFAULT_SWAP_DELAY_FRAMES) {
    options.d = setup.swapDelayFrames;
  }
  if (setup?.auras !== undefined) options.a = setup.auras ? 1 : 0;
  return {
    v: 2,
    s: shared.scenario,
    b: shared.builds.map(packBuild),
    ...(setup ? { p: [setup.rotation.blocks.map(packBlock), options] } : {}),
  };
};

const packedSchema = z.object({
  v: z.literal(2),
  s: z.string(),
  b: z
    .array(z.union([z.string(), z.tuple([z.string(), z.record(z.unknown())])]))
    .min(1)
    .max(4),
  p: z
    .tuple([
      z.array(
        z.union([z.string(), z.tuple([z.string(), z.record(z.number())])])
      ),
      z.record(z.number()),
    ])
    .optional(),
});

// Back to the readable form, which is then checked like a file.
const unpack = (packed: z.infer<typeof packedSchema>) => {
  const [blocks, options] = packed.p ?? [null, {}];
  return {
    version: 1,
    scenario: packed.s,
    builds: packed.b.map(unpackBuild),
    setup: blocks
      ? {
          rotation: { loop: options.l === 1, blocks: blocks.map(unpackBlock) },
          fillWhileWaiting: options.f === 1,
          swapDelayFrames: options.d ?? DEFAULT_SWAP_DELAY_FRAMES,
          ...(options.a === undefined ? {} : { auras: options.a === 1 }),
        }
      : null,
  };
};

// The short form: the compact JSON, compressed, as URL-safe text.
export const encodeSharedRotation = async (
  shared: SharedRotation
): Promise<string> => {
  const json = new TextEncoder().encode(JSON.stringify(pack(shared)));
  return (
    CODE_PREFIX +
    toBase64Url(await pipeThrough(json, new CompressionStream('deflate-raw')))
  );
};

// A link that opens the app with this team.
export const shareLink = (code: string, base: string): string => {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set(SHARE_PARAM, code);
  return url.toString();
};

// What a friend sent: a code, a link with one, or the JSON file's text.
// Throws an Error saying what is wrong with it.
export const decodeSharedRotation = async (
  input: string
): Promise<SharedRotation> => {
  let text = input.trim();
  if (text === '') {
    throw new Error('Paste a code, a link or open a file first.');
  }
  if (/^https?:\/\//.test(text)) {
    const code = new URL(text).searchParams.get(SHARE_PARAM);
    if (!code) {
      throw new Error('That link has no shared rotation in it.');
    }
    text = code;
  }
  let json: string;
  if (text.startsWith('{')) {
    json = text;
  } else if (text.startsWith(CODE_PREFIX) || text.startsWith(OLD_CODE_PREFIX)) {
    try {
      json = new TextDecoder().decode(
        await pipeThrough(
          fromBase64Url(text.slice(CODE_PREFIX.length)),
          new DecompressionStream('deflate-raw')
        )
      );
    } catch {
      throw new Error('That code is incomplete or damaged: copy it again.');
    }
  } else {
    throw new Error('That is not a rotation code, link or file.');
  }
  let parsed: z.infer<typeof sharedSchema>;
  try {
    const raw = JSON.parse(json);
    parsed = sharedSchema.parse(
      raw?.v === 2 ? unpack(packedSchema.parse(raw)) : raw
    );
  } catch {
    throw new Error(
      'That rotation could not be read (made by another version?).'
    );
  }
  return {
    scenario: parsed.scenario,
    builds: parsed.builds as SimulationValues[],
    setup: parsed.setup,
  };
};
