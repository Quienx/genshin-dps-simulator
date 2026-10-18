import { z } from 'zod';

import { RotationSetting } from '../../_lib/rotation/types';
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

// The code starts with this, so a pasted one is told apart from JSON.
const CODE_PREFIX = 'gsim1.';
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
  heldSeconds: z.number().positive().optional(),
  noFinal: z.boolean().optional(),
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

// The short form: the JSON, compressed, as URL-safe text.
export const encodeSharedRotation = async (
  shared: SharedRotation
): Promise<string> => {
  const json = new TextEncoder().encode(
    JSON.stringify({ version: 1, ...shared })
  );
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
  } else if (text.startsWith(CODE_PREFIX)) {
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
    parsed = sharedSchema.parse(JSON.parse(json));
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
