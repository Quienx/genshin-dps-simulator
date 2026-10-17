import { z } from 'zod';

import { RotationSetting } from '../../_lib/rotation/types';
import { createTeamBlock } from '../../_lib/team';

// A rotation of one's own (edit mode) and how it plays, per scenario.
export type SavedRotation = {
  rotation: RotationSetting;
  fillWhileWaiting: boolean;
  swapDelayFrames: number;
  auras?: boolean;
};

// Kept in this browser only (localStorage): it comes back on reload.
const STORAGE_KEY = 'genshin-dps-simulator:rotations';

const blockSchema = z.object({
  uid: z.string(),
  action: z.string(),
  hits: z.number().int().min(1),
  repeat: z.number().int().min(1),
  seconds: z.number().min(0),
  dashCancel: z.boolean(),
});

const savedSchema = z.object({
  version: z.literal(1),
  scenarios: z.record(
    z.object({
      rotation: z.object({ loop: z.boolean(), blocks: z.array(blockSchema) }),
      fillWhileWaiting: z.boolean(),
      swapDelayFrames: z.number().min(0),
      auras: z.boolean().optional(),
    })
  ),
});

export const encodeSavedRotations = (
  scenarios: Record<string, SavedRotation>
): string => JSON.stringify({ version: 1, scenarios });

// What was saved, as it can play now: a block whose action is gone (a
// character changed) is dropped, and a rotation left empty with it. Each
// block gets a new id, since new ones count from 1 again after a reload.
export const decodeSavedRotations = (
  raw: string | null,
  knownActions: (scenarioId: string) => Set<string>
): Record<string, SavedRotation> => {
  if (!raw) {
    return {};
  }
  let parsed: z.infer<typeof savedSchema>;
  try {
    parsed = savedSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parsed.scenarios).flatMap(([scenarioId, saved]) => {
      const known = knownActions(scenarioId);
      const blocks = saved.rotation.blocks
        .filter((entry) => known.has(entry.action))
        .map((entry) => ({ ...entry, uid: createTeamBlock(entry.action).uid }));
      return blocks.length === 0
        ? []
        : [[scenarioId, { ...saved, rotation: { ...saved.rotation, blocks } }]];
    })
  );
};

// Storage can be missing or blocked (private windows): then nothing is
// kept, and the page works as before.
export const loadSavedRotations = (
  knownActions: (scenarioId: string) => Set<string>
): Record<string, SavedRotation> => {
  try {
    return decodeSavedRotations(
      window.localStorage.getItem(STORAGE_KEY),
      knownActions
    );
  } catch {
    return {};
  }
};

export const storeSavedRotations = (
  scenarios: Record<string, SavedRotation>
) => {
  try {
    if (Object.keys(scenarios).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, encodeSavedRotations(scenarios));
    }
  } catch {
    // Not kept: the rotation still works until the page is left.
  }
};
