import { getBlockIconUrl } from './activitySources';
import { getBurstCharge } from './burstCharge';
import { getLoadedCharacter } from './characterData';
import { isCharacterId } from './characters';
import { SimEvent } from './engine/eventLog';
import { ActivityLog } from './engine/runtime';
import { BonusBlock, Condition } from './engine/schema';
import {
  getTeamRotationActions,
  isFieldAction,
  RESONANCES,
  simulateTeam,
  splitTeamActionId,
  toTeamActionId,
} from './engine/simulateTeam';
import { FRAMES_PER_SECOND } from './frames';
import { iconUrl } from './genshinIcons';
import { readNumber } from './readValue';
import { BlockDamage } from './rotation/automaticRotation';
import { cancelHoldsBefore } from './rotation/blocks';
import { RotationAction } from './rotation/rotationSchema';
import {
  RotationBlock,
  RotationSetting,
  RotationTraceEntry,
} from './rotation/types';
import { buildDefaultValues, parseValues, withFlag } from './simulationValues';
import {
  CooldownTrack,
  CritMode,
  HitLogEntry,
  SimulationValues,
} from './types';

// The team the screen starts with, and the rotation it starts from: the
// user's own (saved from the editor, 2026-10-18). Varesa opens with E →
// jump → plunge; the supports buff her (Chevreuse's Q, Hold E and E,
// Iansan's E and Q); then rounds of E → jump → plunge (with a Q, Kablam,
// every other round). The supports come back around 20 s and 38 s, and
// once more at the end. A third value is a Wait's seconds.
export const DEFAULT_TEAM = ['varesa', 'iansan', 'chevreuse', 'nicole'];

export const TEAM_PRESET_ROTATION: [string, string, number?][] = [
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['nicole', 'skill'],
  ['chevreuse', 'burst'],
  ['chevreuse', 'skillHold'],
  ['chevreuse', 'skill'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
  ['iansan', 'wait', 0.5],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['nicole', 'burst'],
  ['nicole', 'skill'],
  ['nicole', 'wait', 0.9],
  ['chevreuse', 'burst'],
  ['chevreuse', 'skill'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['nicole', 'burst'],
  ['nicole', 'skill'],
  ['chevreuse', 'skill'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'burst'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['nicole', 'skill'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
];

// Mavuika's teams. Each cycle is about 21 s, three of them to the end of a
// 60 s run; a Hold E is the E's block with Hold on ('skillHold' here).
// `energyRecharge`: the supports' ER for that rotation, so each Q fires
// every cycle with margin for random particles (checked over rolled runs).
// Rotations follow KQM's Mavuika guide
// (https://keqingmains.com/q/mavuika-quickguide/): the Melt combo
// "Q C4 J C4" is two Flamestrider Charged Attacks of 4 spins with a Dash
// where the guide jumps (there is no jump); the party's Nightsoul points
// (Citlali's Opal Fire, Xilonen's) refill her Fighting Spirit.
type PresetStep = [string, string, number?];
export type PresetTeam = {
  id: string;
  label: string;
  members: string[];
  // Its steps, played three times (none with `blocks`).
  cycle: PresetStep[];
  // Or its rotation as edited, block by block (hold times, Final hits,
  // CDCs, Waits), played once as it is.
  blocks?: Omit<RotationBlock, 'uid'>[];
  energyRecharge: Record<string, number>;
};

// A block of a preset's rotation as edited: its action and only what it
// changes from a new block's.
const presetBlock = (
  action: string,
  changes: Partial<Omit<RotationBlock, 'uid' | 'action'>> = {}
): Omit<RotationBlock, 'uid'> => ({
  action,
  hits: 1,
  repeat: 1,
  seconds: 1,
  dashCancel: false,
  ...changes,
});

// Mavuika's Q, a CDC chain of four spins and her E: the Melt part of a
// cycle in the Citlali, Iansan, Bennett team.
const MAVUIKA_CDC_CHAIN = [
  presetBlock('mavuika:burst'),
  presetBlock('mavuika:wait', { seconds: 0.8 }),
  presetBlock('mavuika:charged', { heldSeconds: 0.75, noFinal: true }),
  presetBlock('mavuika:dodge', { quickCancel: true }),
  presetBlock('mavuika:charged', { heldSeconds: 0.68 }),
  presetBlock('mavuika:dodge', { quickCancel: true }),
  presetBlock('mavuika:charged', { heldSeconds: 0.8 }),
  presetBlock('mavuika:dodge', { quickCancel: true }),
  presetBlock('mavuika:charged', { heldSeconds: 0.85 }),
];

const MELT_COMBO: PresetStep[] = [
  ['mavuika', 'charged', 4],
  ['mavuika', 'dodge'],
  ['mavuika', 'charged', 4],
];

export const MAVUIKA_PRESETS: PresetTeam[] = [
  {
    // The user's own rotation (default builds): Mavuika E, Iansan E N1 Q,
    // Bennett QE, Citlali EQ, then Mavuika Q and a CDC chain; the second
    // cycle fills the cooldowns with Normal Attacks.
    id: 'mavuika-iansan-bennett',
    label: 'Mavuika, Citlali, Iansan, Bennett',
    members: ['mavuika', 'citlali', 'iansan', 'bennett'],
    cycle: [],
    blocks: [
      presetBlock('mavuika:skill'),
      presetBlock('iansan:skill'),
      presetBlock('iansan:normal'),
      presetBlock('iansan:burst'),
      presetBlock('bennett:burst'),
      presetBlock('bennett:skill'),
      presetBlock('citlali:skill'),
      presetBlock('citlali:burst'),
      ...MAVUIKA_CDC_CHAIN,
      presetBlock('mavuika:skill'),
      presetBlock('mavuika:charged', { heldSeconds: 0.58, noFinal: true }),
      presetBlock('iansan:skill'),
      presetBlock('iansan:normal'),
      presetBlock('iansan:normal', { hits: 3 }),
      presetBlock('iansan:burst'),
      presetBlock('bennett:skill'),
      presetBlock('bennett:normal', { hits: 5 }),
      presetBlock('bennett:normal'),
      presetBlock('bennett:skill'),
      presetBlock('bennett:burst'),
      presetBlock('citlali:skill'),
      presetBlock('citlali:normal', { hits: 3 }),
      presetBlock('citlali:burst'),
      ...MAVUIKA_CDC_CHAIN,
    ],
    energyRecharge: {},
  },
  {
    // Citlali and Escoffier keep Cryo on the enemy (Citlali's A1 lowers its
    // Pyro RES), Bennett buffs her ATK; a second Bennett E for his next Q.
    id: 'mavuika',
    label: 'Mavuika Melt team',
    members: ['mavuika', 'citlali', 'escoffier', 'bennett'],
    cycle: [
      ['citlali', 'skill'],
      ['escoffier', 'skill'],
      ['bennett', 'skill'],
      ['citlali', 'burst'],
      ['escoffier', 'burst'],
      ['bennett', 'burst'],
      ['mavuika', 'skillHold'],
      ['mavuika', 'burst'],
      ...MELT_COMBO,
      ['bennett', 'skill'],
    ],
    // Bennett, with Aquila Favonia, has no Favonius particles.
    energyRecharge: { citlali: 300, escoffier: 320, bennett: 480 },
  },
  {
    // KQM's Xilonen variant: Mavuika tE > Xilonen E N2 > Bennett EQ >
    // Citlali EQ (N1) > Mavuika Q, Melt combo, and a Normal combo to fill
    // her Q's cooldown (the guide's "1-2 s outside the Burst").
    id: 'mavuika-xilonen-bennett',
    label: 'Mavuika, Citlali, Xilonen, Bennett',
    members: ['mavuika', 'citlali', 'xilonen', 'bennett'],
    cycle: [
      ['mavuika', 'skill'],
      ['xilonen', 'skill'],
      ['xilonen', 'normal', 2],
      ['bennett', 'skill'],
      ['bennett', 'burst'],
      ['citlali', 'skill'],
      ['citlali', 'burst'],
      ['citlali', 'normal', 1],
      ['mavuika', 'burst'],
      ...MELT_COMBO,
      ['mavuika', 'normal', 5],
    ],
    energyRecharge: { citlali: 300, xilonen: 220, bennett: 480 },
  },
  {
    // KQM's Iansan variant with Xilonen instead of Bennett: Mavuika tE >
    // Xilonen E N2 > Iansan E N1 Q > Citlali EQ (N1) > Mavuika Q, Melt
    // combo, a Normal combo.
    id: 'mavuika-xilonen-iansan',
    label: 'Mavuika, Citlali, Xilonen, Iansan',
    members: ['mavuika', 'citlali', 'xilonen', 'iansan'],
    cycle: [
      ['mavuika', 'skill'],
      ['xilonen', 'skill'],
      ['xilonen', 'normal', 2],
      ['iansan', 'skill'],
      ['iansan', 'normal', 1],
      ['iansan', 'burst'],
      ['citlali', 'skill'],
      ['citlali', 'burst'],
      ['citlali', 'normal', 1],
      ['mavuika', 'burst'],
      ...MELT_COMBO,
      ['mavuika', 'normal', 5],
    ],
    energyRecharge: { citlali: 320, xilonen: 220, iansan: 260 },
  },
];

// Nefer's Lunar-Bloom: Columbina's Gravity Ripple keeps Hydro on the
// enemy, Nefer's Dendro hits make Lunar-Bloom, the party gathers Verdant Dew
// (and Moonridge Dew in the Lunar Domain) and Nefer spends it on Phantasm
// Performance (3 per E, both E charges per cycle). About 20 s per cycle.
export const NEFER_PRESETS: PresetTeam[] = [
  {
    id: 'nefer-columbina',
    label: 'Nefer + Columbina (Lunar-Bloom)',
    members: ['nefer', 'columbina'],
    cycle: [
      ['columbina', 'skill'],
      ['columbina', 'burst'],
      ['nefer', 'skill'],
      ...[1, 2, 3].flatMap((): PresetStep[] => [
        ['nefer', 'normal', 2],
        ['nefer', 'charged'],
      ]),
      ['nefer', 'burst'],
      ['nefer', 'skill'],
      ...[1, 2, 3].flatMap((): PresetStep[] => [
        ['nefer', 'normal', 2],
        ['nefer', 'charged'],
      ]),
    ],
    // Two members only: few particles, so both need a lot of ER for a Q
    // every cycle (checked over rolled runs).
    energyRecharge: { nefer: 250, columbina: 300 },
  },
];

export const TEAM_SIZE = 4;

export type TeamState = {
  members: SimulationValues[];
  rotation: RotationSetting;
  // The member on the field keeps attacking (its automatic rotation) while
  // the next member's action recharges.
  fillWhileWaiting: boolean;
  // Frames each swap takes (gcsim's swap_delay).
  swapDelayFrames: number;
  // The enemy's auras (off: one character alone, as on its own screen).
  auras?: boolean;
};

// What gcsim configs usually set (swap_delay=12): a swap is not instant.
export const DEFAULT_SWAP_DELAY_FRAMES = 12;

let nextUid = 0;
export const createTeamBlock = (
  actionId: string,
  hits = 1,
  hold = false
): RotationBlock => {
  nextUid += 1;
  return {
    uid: `team-${nextUid}`,
    action: actionId,
    hits,
    repeat: 1,
    seconds: 1,
    dashCancel: false,
    ...(hold ? { hold: true } : {}),
  };
};

// The preset's steps of the members in the team.
export const buildPresetRotation = (
  characterIds: string[]
): RotationSetting => ({
  // Written out for the whole run: not repeated.
  loop: false,
  blocks: TEAM_PRESET_ROTATION.filter(([characterId]) =>
    characterIds.includes(characterId)
  ).map(([characterId, action, seconds]) =>
    action === 'skillHold'
      ? createTeamBlock(toTeamActionId(characterId, 'skill'), 1, true)
      : {
          ...createTeamBlock(toTeamActionId(characterId, action)),
          ...(seconds === undefined ? {} : { seconds }),
        }
  ),
});

// A run's steps as a rotation to edit: each Normal Attack combo (N1, N2…
// one right after the other) one block of that many presses, every other
// step a block of its own (a Wait keeps its seconds).
export const buildRotationFromRun = (run: {
  trace: RotationTraceEntry[];
}): RotationSetting => {
  const blocks: RotationBlock[] = [];
  let last: RotationTraceEntry | null = null;
  run.trace.forEach((entry) => {
    // Swaps are the engine's own: never a block.
    if (entry.kind === 'swap') {
      return;
    }
    const block = blocks.at(-1);
    if (
      block &&
      last &&
      entry.action === last.action &&
      entry.comboIndex !== null &&
      last.comboIndex !== null &&
      entry.comboIndex === last.comboIndex + 1
    ) {
      block.hits += 1;
    } else {
      blocks.push({
        ...createTeamBlock(entry.action),
        seconds: entry.kind === 'wait' ? entry.seconds : 1,
      });
    }
    last = entry;
  });
  return { loop: false, blocks };
};

// A member's defaults. In a team the enemy's auras make Overloaded, so the
// solo screen's "Overloaded every … s" options are off.
export const buildMemberValues = (characterId: string): SimulationValues =>
  ['overloaded', 'teamOverloaded'].reduce(
    (values, flag) =>
      flag in values.flags ? withFlag(values, flag, false) : values,
    buildDefaultValues(characterId)
  );

export const buildDefaultTeam = (): TeamState => {
  const ids = DEFAULT_TEAM.filter(isCharacterId).slice(0, TEAM_SIZE);
  return {
    members: ids.map(buildMemberValues),
    rotation: buildPresetRotation(ids),
    // Off: Varesa's automatic list spends her free E and Kablam Energy
    // before the supports' buffs are back.
    fillWhileWaiting: false,
    swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
  };
};

// A preset team: its members (with the rotation's ER) and three cycles.
export const buildPresetTeam = (preset: PresetTeam): TeamState => ({
  members: preset.members.map((characterId) => {
    const values = buildMemberValues(characterId);
    const energyRecharge = preset.energyRecharge[characterId];
    return energyRecharge
      ? {
          ...values,
          numbers: {
            ...values.numbers,
            energyRecharge: String(energyRecharge),
          },
        }
      : values;
  }),
  // As edited, block by block; else the cycle three times, where a spin
  // with a Dash right after loses its Final, as when one is dropped there
  // (the Melt combo's "C4 J C4").
  rotation: preset.blocks
    ? {
        loop: false,
        blocks: preset.blocks.map((block) => ({
          ...block,
          uid: createTeamBlock(block.action).uid,
        })),
      }
    : cancelHoldsBefore(
        {
          loop: false,
          blocks: [1, 2, 3].flatMap(() =>
            preset.cycle.map(([characterId, action, hits]) =>
              action === 'skillHold'
                ? createTeamBlock(toTeamActionId(characterId, 'skill'), 1, true)
                : createTeamBlock(toTeamActionId(characterId, action), hits)
            )
          ),
        },
        getTeamActions(preset.members)
      ),
  fillWhileWaiting: false,
  swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
});

// The first Mavuika team (Citlali, Iansan, Bennett).
export const MAVUIKA_TEAM = MAVUIKA_PRESETS[0].members;
export const buildMavuikaTeam = (): TeamState =>
  buildPresetTeam(MAVUIKA_PRESETS[0]);

// Varesa's approximations of her teammates, for her solo screen: in a team
// the real teammates give those buffs.
const SOLO_TEAM_FIELDS = new Set([
  'overloaded',
  'overloadedEvery',
  'teamOverloaded',
  'teamIansan',
  'iansanAtk',
  'teamIansanC2',
  'teamScroll',
  'teamChevreuse',
  'chevreuseAtkPercent',
  'teamChevreuseC1',
  'teamChevreuseC6',
  'teamNicole',
  'nicoleAtk',
  'nicoleDmgBonus',
  'teamNicoleQ',
  'nicoleProjection',
]);

export const isSoloTeamField = (name: string): boolean =>
  SOLO_TEAM_FIELDS.has(name);

// Swap: a member comes on the field (the General group's ⇄, pointed at one).
export const isSwapAction = (actionId: string): boolean =>
  splitTeamActionId(actionId).actionId === 'swap';

// The palette, one group per member, labelled with the member's name.
// Dash, Wait and Swap are not in them: they are in the General group.
export type TeamPaletteGroup = {
  characterId: string;
  name: string;
  // Its place in the party (picks its color).
  slot: number;
  avatar: string;
  actions: RotationAction[];
};

export const getTeamActions = (characterIds: string[]): RotationAction[] =>
  getTeamRotationActions(characterIds).map((action) => {
    const { characterId } = splitTeamActionId(action.id);
    const { name } = getLoadedCharacter(characterId).character;
    return {
      ...action,
      // The block's color and avatar tell the member; its key stays short.
      label: `${name}: ${action.label}`,
    };
  });

export const getTeamPaletteGroups = (
  characterIds: string[],
  actions: RotationAction[]
): TeamPaletteGroup[] =>
  characterIds.map((characterId, slot) => ({
    characterId,
    name: getLoadedCharacter(characterId).character.name,
    slot,
    avatar: iconUrl(getLoadedCharacter(characterId).character.icons.avatar),
    actions: actions.filter(
      (action) =>
        splitTeamActionId(action.id).characterId === characterId &&
        !action.hidden &&
        !isFieldAction(action.id) &&
        !isSwapAction(action.id)
    ),
  }));

// The General group: each field action (Dash, Wait) once, without a
// member's name. Dropped on a member's row it is theirs, else the
// member's on the field where it lands (nameFieldAction). A kit's own
// special dash is a `move` action of its own, in its member's group.
export const getGeneralPaletteActions = (
  actions: RotationAction[]
): RotationAction[] => {
  const seen = new Set<string>();
  return actions.flatMap((action) => {
    const { actionId } = splitTeamActionId(action.id);
    if (action.hidden || !isFieldAction(action.id) || seen.has(actionId)) {
      return [];
    }
    seen.add(actionId);
    return [{ ...action, label: action.label.replace(/^[^:]+:\s*/, '') }];
  });
};

// Without Swap blocks: swaps are the engine's own (it swaps to the block
// of a member off the field), never the user's. A rotation saved or shared
// before may still have some.
export const withoutSwaps = (rotation: RotationSetting): RotationSetting => {
  const blocks = rotation.blocks.filter((entry) => !isSwapAction(entry.action));
  return blocks.length === rotation.blocks.length
    ? rotation
    : { ...rotation, blocks };
};

// A Dash or Wait block just dropped, named after whose it is: the member
// whose row it was dropped on (the run swaps them in first if they are
// off the field), else the member on the field there: the one of the
// block before it, or, at the start, of the first block that is not one.
// Other blocks keep their names.
export const nameFieldAction = (
  rotation: RotationSetting,
  uid: string,
  rowMember: string | null = null
): RotationSetting => {
  const index = rotation.blocks.findIndex((entry) => entry.uid === uid);
  const entry = rotation.blocks[index];
  if (!entry || !isFieldAction(entry.action)) {
    return rotation;
  }
  const before = rotation.blocks[index - 1];
  const starter = rotation.blocks
    .slice(index + 1)
    .find((next) => !isFieldAction(next.action));
  const characterId =
    rowMember ??
    (before ? splitTeamActionId(before.action).characterId : null) ??
    (starter ? splitTeamActionId(starter.action).characterId : null);
  if (!characterId) {
    return rotation;
  }
  const action = toTeamActionId(
    characterId,
    splitTeamActionId(entry.action).actionId
  );
  return action === entry.action
    ? rotation
    : {
        ...rotation,
        blocks: rotation.blocks.map((block) =>
          block.uid === uid ? { ...block, action } : block
        ),
      };
};

// A run's biggest hit: who, with what and when.
export type TeamHighestHit = {
  characterId: string;
  name: string;
  damage: number;
  // The action that made it ("Volcano Kablam"), else its category.
  source: string;
  category: string;
  time: number;
  isCrit: boolean;
};

export type TeamMemberRun = {
  characterId: string;
  name: string;
  // What the moment-by-moment state is rebuilt from (getTeamSnapshot).
  activity?: ActivityLog;
  // Every hit it dealt, with the bonuses applied (getActionBonuses).
  hitLog: HitLogEntry[];
  cooldownTracks: CooldownTrack[];
  burstCost: number | null;
  highestHit: TeamHighestHit | null;
  dps: number;
  // DMG over the whole run.
  damage: number;
  share: number;
  damageByCategory: Record<string, number>;
  // Time on the field (s).
  fieldTime: number;
};

export type TeamRun = {
  // Over the counted duration.
  dps: number;
  // DMG within the counted duration.
  totalDamage: number;
  // How long the run played (s): its blocks past the counted duration too.
  duration: number;
  // The part of it that counts (s): the build's duration, 60 by default.
  countedDuration: number;
  trace: RotationTraceEntry[];
  // Its duration ended before its rotation did (steps left unplayed).
  rotationCutShort: boolean;
  // Every member's cooldowns, ids prefixed like its actions.
  cooldowns: CooldownTrack[];
  damageByBlock: Record<string, BlockDamage>;
  members: TeamMemberRun[];
  highestHit: TeamHighestHit | null;
  swaps: { time: number; characterId: string }[];
  // Everything the run did, in order (the inspector).
  events: SimEvent[];
};

const getHighestHit = (
  characterId: string,
  name: string,
  hits: HitLogEntry[]
): TeamHighestHit | null => {
  const best = hits.reduce<HitLogEntry | null>(
    (top, hit) => (!top || hit.damage > top.damage ? hit : top),
    null
  );
  if (!best) {
    return null;
  }
  const { actions } = getLoadedCharacter(characterId);
  return {
    characterId,
    name,
    damage: best.damage,
    source: (best.actionId && actions[best.actionId]?.label) || best.category,
    category: best.category,
    time: best.time,
    isCrit: best.isCrit,
  };
};

// `rolled`: CRITs were rolled, so each block counts its CRITs.
const getDamageByBlock = (
  hits: HitLogEntry[],
  total: number,
  rolled: boolean
): Record<string, BlockDamage> => {
  const byBlock: Record<string, BlockDamage> = {};
  hits.forEach((hit) => {
    if (!hit.blockUid) {
      return;
    }
    const entry = byBlock[hit.blockUid] ?? {
      damage: 0,
      hits: 0,
      share: 0,
      maxHit: 0,
      ...(rolled ? { crits: 0 } : {}),
    };
    entry.damage += hit.damage;
    if (rolled && hit.isCrit) {
      entry.crits = (entry.crits ?? 0) + 1;
    }
    entry.maxHit = Math.max(entry.maxHit, hit.maxDamage);
    entry.hits += 1;
    byBlock[hit.blockUid] = entry;
  });
  Object.values(byBlock).forEach((entry) => {
    entry.share = total > 0 ? entry.damage / total : 0;
  });
  return byBlock;
};

// One character as on its own screen: its build's rotation (its
// automatic list by default), no party, its own Overloaded options.
export const runSolo = (values: SimulationValues, critMode: CritMode) =>
  runTeam(
    {
      members: [values],
      rotation: values.rotation && {
        ...values.rotation,
        blocks: values.rotation.blocks.map((block) => ({
          ...block,
          action: toTeamActionId(values.character, block.action),
        })),
      },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
      auras: false,
    },
    critMode
  );

// Expected damage of the team's rotation (no CRIT rolls): the live preview.
export const runTeamExpected = (team: TeamState): TeamRun =>
  runTeam(team, 'expected');

// What a run needs: a team, or one character alone with `rotation: null`
// (its automatic list) and `auras: false` (its own screen's options).
export type TeamRunSetup = Omit<TeamState, 'rotation'> & {
  rotation: RotationSetting | null;
  auras?: boolean;
  // Hits after it (s) are played but not counted. None: the run's duration.
  countedSeconds?: number;
};

// The team's rotation with CRITs rolled (the Simulate button), or expected.
export const runTeam = (
  {
    members,
    rotation,
    fillWhileWaiting,
    swapDelayFrames,
    auras = true,
    countedSeconds,
  }: TeamRunSetup,
  critMode: CritMode
): TeamRun => {
  const parsed = members.map(parseValues);
  const played = Math.max(1, readNumber(parsed[0], 'duration'));
  const duration = Math.min(played, countedSeconds ?? played);
  const result = simulateTeam(
    members.map((values, index) => ({
      characterId: values.character,
      values: parsed[index],
    })),
    rotation,
    {
      critMode,
      fillWhileWaiting,
      swapDelayFrames,
      auras,
      countUntilFrame:
        duration < played ? duration * FRAMES_PER_SECOND : undefined,
    }
  );
  const countedHits = (hitLog: HitLogEntry[]) =>
    hitLog.filter((hit) => hit.counted);
  const total = result.totalDamage;
  const swaps = result.swaps.map(({ frame, characterId }) => ({
    time: frame / 60,
    characterId,
  }));
  const fieldTime = (characterId: string) =>
    swaps.reduce((sum, swap, index) => {
      if (swap.characterId !== characterId) {
        return sum;
      }
      const end = swaps[index + 1]?.time ?? duration;
      return sum + Math.max(0, Math.min(end, duration) - swap.time);
    }, 0);
  return {
    dps: total / duration,
    totalDamage: total,
    duration: played,
    countedDuration: duration,
    trace: result.rotationTrace,
    rotationCutShort: result.rotationCutShort,
    cooldowns: result.members.flatMap((member) =>
      (member.cooldowns ?? []).map((track) => ({
        ...track,
        actionId: toTeamActionId(member.characterId, track.actionId),
        label: `${member.name} ${track.label}`,
      }))
    ),
    damageByBlock: getDamageByBlock(
      result.members.flatMap((member) => countedHits(member.context.hitLog)),
      total,
      critMode === 'random'
    ),
    highestHit: result.members
      .map((member) =>
        getHighestHit(
          member.characterId,
          member.name,
          countedHits(member.context.hitLog)
        )
      )
      .reduce<TeamHighestHit | null>(
        (top, hit) => (hit && (!top || hit.damage > top.damage) ? hit : top),
        null
      ),
    members: result.members.map((member) => ({
      characterId: member.characterId,
      name: member.name,
      activity: member.activity,
      hitLog: member.context.hitLog,
      cooldownTracks: member.cooldowns ?? [],
      burstCost:
        getLoadedCharacter(member.characterId).character.talents.find(
          (talent) => talent.kind === 'burst'
        )?.energyCost ?? null,
      highestHit: getHighestHit(
        member.characterId,
        member.name,
        countedHits(member.context.hitLog)
      ),
      dps: member.context.totalDamage / duration,
      damage: member.context.totalDamage,
      share: total > 0 ? member.context.totalDamage / total : 0,
      damageByCategory: member.context.damageByCategory,
      fieldTime: fieldTime(member.characterId),
    })),
    swaps,
    events: result.events,
  };
};

// A cooldown at a moment: charges ready, and the wait for the next one.
// The longest a rotation of one's own can run (10 minutes).
const MAX_OWN_SECONDS = 600;
// The length a team's own rotation had last (s), tried first next time.
const ownSeconds = new Map<string, number>();

// A rotation of one's own (edit mode): it plays every block, so the run
// lasts past its duration when the blocks need it (to the second after
// the last one ends), but only its duration counts: the blocks past it
// are shown, not counted. A looped one keeps its duration.
export const runOwnRotation = (team: TeamState, critMode: CritMode) => {
  const withSeconds = (seconds: number): TeamState => ({
    ...team,
    members: team.members.map((values) => ({
      ...values,
      numbers: { ...values.numbers, duration: String(seconds) },
    })),
  });
  if (team.rotation.loop) {
    return runTeam(team, critMode);
  }
  const base = readNumber(parseValues(team.members[0]), 'duration');
  const play = (seconds: number) =>
    runTeam(
      seconds === base
        ? team
        : { ...withSeconds(seconds), countedSeconds: base },
      critMode
    );
  // As long as its blocks need: to the second after the last one ends.
  const lengthOf = (run: TeamRun) =>
    Math.min(
      MAX_OWN_SECONDS,
      Math.max(
        base,
        Math.ceil(Math.max(0, ...run.trace.map((entry) => entry.endTime)))
      )
    );
  // Played once at the length it had last time (or its duration). Every
  // block played: its length is known, and it is the run when it is that
  // one (else played again at it). Cut short: its length is found playing
  // it to the longest one first.
  const key = team.members.map((values) => values.character).join(',');
  const guess = ownSeconds.get(key) ?? base;
  const first = play(guess);
  const seconds = first.rotationCutShort
    ? lengthOf(runTeam(withSeconds(MAX_OWN_SECONDS), 'expected'))
    : lengthOf(first);
  ownSeconds.set(key, seconds);
  return seconds === guess && !first.rotationCutShort ? first : play(seconds);
};

export type CooldownState = {
  ready: number;
  charges: number;
  remaining: number;
  // Seconds until the next charge comes back, while one recharges (even
  // with another one ready).
  recharging: number;
  // The full cooldown (s), for a sweep like the game's.
  max: number;
};

export type TeamMemberSnapshot = {
  characterId: string;
  name: string;
  element: string;
  // Project Amber icons of the E and the Q.
  skillIcon: string | null;
  burstIcon: string | null;
  onField: boolean;
  energy: { value: number; max: number } | null;
  skill: CooldownState;
  burst: CooldownState;
  // Nightsoul points, for those who have them.
  points: { value: number; max: number } | null;
  // Statuses up (stack statuses with their count).
  statuses: string[];
};

const getCooldownState = (
  tracks: CooldownTrack[],
  cooldownId: string,
  time: number
): CooldownState => {
  const track = tracks.find((entry) => entry.actionId === cooldownId);
  // The latest change before `time`: a use at `time` is not counted yet.
  const latest = track?.events.reduce<CooldownTrack['events'][number] | null>(
    (found, event) => (event.time < time ? event : found),
    null
  );
  const charges = latest?.charges ?? (latest ? [latest.readyAt] : []);
  const total = Math.max(
    1,
    ...(track?.events.map((event) => event.charges?.length ?? 1) ?? [1])
  );
  // The longest a use put it on cooldown.
  const max = Math.max(
    0,
    ...(track?.events.map(
      (event) => Math.min(...(event.charges ?? [event.readyAt])) - event.time
    ) ?? [0])
  );
  if (charges.length === 0) {
    return { ready: total, charges: total, remaining: 0, recharging: 0, max };
  }
  const ready = charges.filter((readyAt) => readyAt <= time).length;
  const pending = charges.filter(
    (readyAt) => readyAt > time && readyAt !== Number.POSITIVE_INFINITY
  );
  const recharging = pending.length > 0 ? Math.min(...pending) - time : 0;
  return {
    ready,
    charges: total,
    remaining: ready > 0 ? 0 : recharging,
    recharging,
    max,
  };
};

// A resource's value just before `frame`.
const getResourceAt = (
  log: { frame: number; value: number }[] | undefined,
  frame: number
): number | null => {
  if (!log || log.length === 0) {
    return null;
  }
  const before = log.filter((entry) => entry.frame < frame);
  return (before[before.length - 1] ?? log[0]).value;
};

// Every member's state just before `time` (s) of a team run: on the field
// or not, Energy, E and Q cooldowns, Nightsoul points and statuses.
export const getTeamSnapshot = (
  run: TeamRun,
  time: number
): TeamMemberSnapshot[] => {
  const frame = Math.round(time * FRAMES_PER_SECOND);
  // Just before the frame: what the action at `time` changes is not in.
  const before = frame - 0.5;
  const onField = run.swaps.reduce<string | null>(
    (found, swap) => (swap.time <= time + 1e-9 ? swap.characterId : found),
    null
  );
  return run.members.map((member) => {
    const activity = member.activity;
    const labelOf = (id: string) =>
      activity?.blocks.find((block) => block.id === id)?.label ?? id;
    const energy = getResourceAt(activity?.resources.energy, frame);
    const points = getResourceAt(activity?.resources.nightsoul, frame);
    const statuses = Object.entries(activity?.statuses ?? {})
      .filter(([, intervals]) =>
        intervals.some(({ start, end }) => start <= before && before < end)
      )
      .map(([id]) => labelOf(id));
    const stacks = Object.entries(activity?.stacks ?? {}).flatMap(
      ([id, intervals]) => {
        // Never more than the status allows (extra stacks only refresh).
        const up = Math.min(
          activity?.blocks.find((block) => block.id === id)?.stackMax ??
            Number.POSITIVE_INFINITY,
          intervals.filter(({ start, end }) => start <= before && before < end)
            .length
        );
        return up > 0 ? [`${labelOf(id)} ×${up}`] : [];
      }
    );
    const { talents, element } = getLoadedCharacter(
      member.characterId
    ).character;
    return {
      characterId: member.characterId,
      name: member.name,
      element,
      skillIcon:
        talents.find((talent) => talent.kind === 'skill')?.icon ?? null,
      burstIcon:
        talents.find((talent) => talent.kind === 'burst')?.icon ?? null,
      onField: onField === member.characterId,
      energy:
        energy === null || member.burstCost === null
          ? null
          : { value: energy, max: member.burstCost },
      skill: getCooldownState(member.cooldownTracks, 'skill', time),
      burst: getCooldownState(member.cooldownTracks, 'burst', time),
      points:
        points === null
          ? null
          : {
              value: points,
              max:
                activity?.blocks.find((block) => block.id === 'nightsoul')
                  ?.max ?? points,
            },
      statuses: [...statuses, ...stacks],
    };
  });
};

// One line of the Event panel's character state.
export type StateRow = {
  id: string;
  label: string;
  iconUrl: string | null;
  // Null when there is nothing to count (a weapon without stacks).
  value: number | null;
  // Its value just before `since` (the action's start); null without one.
  before: number | null;
  max: number | null;
  format?: 'percent';
  // A status' seconds left (a weapon's buff), when one times it.
  remaining?: number | null;
  // What fills the Q: how much it needs (Mavuika's 100 of 200 Fighting
  // Spirit).
  needed?: number;
};

// A character's own state at a moment, for the Event panel: always the
// same three lines, so the panel never jumps. Its mechanic (Nightsoul
// points, else Bond of Life; null without either), Energy, and its weapon
// with its stacks.
export type CharacterState = {
  mechanic: StateRow | null;
  // What fills the Q: its Energy, or what it needs instead (Mavuika's
  // Fighting Spirit).
  energy: StateRow | null;
  weapon: StateRow;
  // The E and the Q buttons, as in-game.
  skill: TalentButton;
  burst: TalentButton;
};

// An E or Q button: the icon of what it would do now (a form's when one
// holds: Varesa's Fiery Passion Rush), its charges and cooldown.
export type TalentButton = {
  // Project Amber icon name (SkillCooldownIcon draws it).
  icon: string | null;
  label: string;
  // The form's name while one replaces the action; null otherwise.
  form: string | null;
  cooldown: CooldownState;
};

// Whether a form's condition holds at `frame`, from what the run logged:
// statuses, stacks and resources. Flags, fields and planner-only
// conditions are not logged, so they never hold here.
const holdsAt = (
  condition: Condition,
  activity: ActivityLog,
  frame: number
): boolean => {
  const upAt = ({ start, end }: { start: number; end: number }) =>
    start <= frame && frame < end;
  if ('all' in condition) {
    return condition.all.every((entry) => holdsAt(entry, activity, frame));
  }
  if ('any' in condition) {
    return condition.any.some((entry) => holdsAt(entry, activity, frame));
  }
  if ('not' in condition) {
    return !holdsAt(condition.not, activity, frame);
  }
  if ('status' in condition) {
    return (
      (activity.statuses[condition.status] ?? []).some(upAt) ||
      (activity.stacks[condition.status] ?? []).some(upAt)
    );
  }
  if ('resource' in condition) {
    const value = getResourceAt(
      activity.resources[condition.resource],
      frame + 1
    );
    if (value === null) {
      return false;
    }
    const { gt, gte, lt, lte } = condition;
    return (
      (gt === undefined || value > gt) &&
      (gte === undefined || value >= gte) &&
      (lt === undefined || value < lt) &&
      (lte === undefined || value <= lte)
    );
  }
  return false;
};

// Verdant Dew: the party's, shown on each member that uses it.
const MECHANIC_IDS = ['nightsoul', 'bondOfLife', 'verdantDew'];

// The track only knows the charges it has seen used: the talent says how
// many there are (Varesa's E has 2 before her first use).
const withCharges = (state: CooldownState, charges: number): CooldownState => {
  if (charges <= state.charges) {
    return state;
  }
  const ready = state.ready + (charges - state.charges);
  return {
    ...state,
    charges,
    ready,
    remaining: ready > 0 ? 0 : state.remaining,
  };
};

// The E or Q at `time`: the first form whose condition holds (as the
// engine picks it), its icon, and the cooldown it shares.
const talentButton = (
  member: TeamMemberRun,
  kind: 'skill' | 'burst',
  time: number,
  activity: ActivityLog | null
): TalentButton => {
  const talent = getLoadedCharacter(member.characterId).character.talents.find(
    (entry) => entry.kind === kind
  );
  const frame = Math.round(time * FRAMES_PER_SECOND);
  const form = activity
    ? talent?.forms.find(
        (entry) =>
          (!entry.replaces || entry.replaces === kind) &&
          holdsAt(entry.while, activity, frame)
      )
    : undefined;
  const icon = form?.icon ?? talent?.icon;
  return {
    icon: icon ?? null,
    label: talent?.name ?? kind,
    form: form ? form.label ?? form.id : null,
    cooldown: withCharges(
      getCooldownState(member.cooldownTracks, kind, time),
      talent?.cooldown?.charges ?? 1
    ),
  };
};

// A member's own state at `time` (s), changes on that frame included; with
// `since`, each value just before it too.
export const getCharacterState = (
  member: TeamMemberRun,
  time: number,
  since: number | null
): CharacterState => {
  const { character } = getLoadedCharacter(member.characterId);
  const charge = getBurstCharge(character);
  const activity = member.activity;
  const frame = Math.round(time * FRAMES_PER_SECOND);
  const weaponRow: StateRow = {
    id: 'weapon',
    label: character.weapon.name,
    iconUrl: iconUrl(character.weapon.icon),
    value: null,
    before: null,
    max: null,
  };
  if (!activity) {
    return {
      mechanic: null,
      energy: null,
      weapon: weaponRow,
      skill: talentButton(member, 'skill', time, null),
      burst: talentButton(member, 'burst', time, null),
    };
  }
  const resourceRow = (id: string): StateRow | null => {
    const block = activity.blocks.find(
      (entry) => entry.id === id && entry.type === 'resource'
    );
    const log = activity.resources[id];
    const value = getResourceAt(log, frame + 1);
    if (!block || value === null) {
      return null;
    }
    return {
      id,
      label: block.label,
      iconUrl: getBlockIconUrl(character, block),
      value,
      before:
        since === null
          ? null
          : getResourceAt(log, Math.round(since * FRAMES_PER_SECOND)),
      max: id === 'energy' ? member.burstCost : block.max ?? null,
      ...(block.format ? { format: block.format } : {}),
      ...(id === charge?.resource ? { needed: charge.needed } : {}),
    };
  };
  const mechanic =
    MECHANIC_IDS.map(resourceRow).find((row) => row !== null) ?? null;
  // The weapon's stacks: a resource that counts them, else a stack status.
  const weaponBlocks = activity.blocks.filter(
    (block) => block.source === 'weapon'
  );
  const stackResource = weaponBlocks.find((block) => block.type === 'resource');
  const stackStatus = weaponBlocks.find(
    (block) => block.type === 'status' && block.stackMax !== undefined
  );
  let weapon = weaponRow;
  if (stackResource) {
    const row = resourceRow(stackResource.id);
    weapon = row
      ? {
          ...weaponRow,
          ...row,
          id: 'weapon',
          label: weaponRow.label,
          iconUrl: weaponRow.iconUrl,
        }
      : weaponRow;
  } else if (stackStatus) {
    const countAt = (at: number) =>
      Math.min(
        stackStatus.stackMax ?? Number.POSITIVE_INFINITY,
        (activity.stacks[stackStatus.id] ?? []).filter(
          ({ start, end }) => start <= at && at < end
        ).length
      );
    const value = countAt(frame);
    weapon = {
      ...weaponRow,
      value,
      before:
        since === null
          ? null
          : countAt(Math.round(since * FRAMES_PER_SECOND) - 1),
      max: stackStatus.stackMax ?? null,
      remaining:
        value > 0 ? getRemaining(activity, [stackStatus.id], time) : null,
    };
  }
  return {
    mechanic,
    energy: charge && resourceRow(charge.resource),
    weapon,
    skill: talentButton(member, 'skill', time, activity),
    burst: talentButton(member, 'burst', time, activity),
  };
};

// A bonus applied to an action's hits.
export type ActionBonus = {
  // The block id; a teammate's is "<their id>/<block id>".
  id: string;
  label: string;
  // Who gives it, and what of theirs: a passive, a constellation…
  from: string;
  source: string;
  iconUrl: string | null;
  // Its value on the action's first hit with it ("+30% ATK", "5 stacks +75%").
  value: string;
  // On how many of the action's hits.
  hits: number;
  totalHits: number;
  // When the first hit with it landed (s), and how long it still lasted
  // then; null when nothing times it (a set, a weapon, a flag).
  time: number;
  remaining: number | null;
  // An elemental resonance's element (it has no icon of its own).
  element?: string;
};

const ALL_ELEMENTS = [
  'Pyro',
  'Hydro',
  'Electro',
  'Cryo',
  'Anemo',
  'Geo',
  'Dendro',
];

// What a bonus raises, in words: "Plunge DMG", "Elemental DMG",
// "Pyro/Electro RES", "ATK"; null when it is not a stat bonus.
const describeBonusStat = (block: BonusBlock): string | null => {
  const elements = block.match?.elements ?? [];
  const elementText =
    elements.length === 0
      ? ''
      : ALL_ELEMENTS.every((element) => elements.includes(element))
      ? 'Elemental'
      : elements.join('/');
  const scope = [...(block.match?.categories ?? []), elementText]
    .filter(Boolean)
    .join(' ');
  const scoped = (text: string) => (scope ? `${scope} ${text}` : text);
  switch (block.stat) {
    case 'dmgBonus':
      return scoped('DMG');
    case 'flatDamage':
      return scoped('DMG (flat)');
    case 'critRate':
      return scoped('CRIT Rate');
    case 'critDamage':
      return scoped('CRIT DMG');
    case 'resShred':
      return `${elementText || 'All'} RES`;
    case 'atkPercent':
    case 'flatAtk':
      return 'ATK';
    case 'hpPercent':
    case 'flatHp':
      return 'HP';
    case 'defPercent':
    case 'flatDef':
      return 'DEF';
    case 'elementalMastery':
      return 'EM';
    case 'defReduction':
      return 'DEF reduction';
    case 'defIgnore':
      return 'DEF ignored';
    case 'flatMultiplier':
      return scoped('talent %');
    default:
      return null;
  }
};

// A hit note's value ("5 stacks +75%", "+40% RES shred") with what it
// raises instead of the short stat name; RES shred reads as a RES cut.
const describeBonusValue = (raw: string, block: BonusBlock | undefined) => {
  const stat = block ? describeBonusStat(block) : null;
  if (!block || !stat) {
    return raw;
  }
  const bare = raw
    .replace(/ (ATK|HP|DEF|EM|DMG|RES shred|DEF reduction|DEF ignored)$/, '')
    .trim();
  const signed =
    block.stat === 'resShred' ? bare.replace(/\+(?=[\d.,]+%?$)/, '-') : bare;
  return `${signed} ${stat}`;
};

const findBonusBlock = (
  characterId: string,
  blockId: string
): BonusBlock | undefined => {
  const { character } = getLoadedCharacter(characterId);
  const block = [
    ...character.blocks,
    ...character.artifactSet.blocks,
    ...character.weapon.blocks,
  ].find((entry) => entry.id === blockId);
  return block?.type === 'bonus' ? block : undefined;
};

// The statuses a bonus lasts with: those its conditions need up (and the
// stack status it counts). Conditions on a status being down, or on
// resources, do not time it.
const getTimingStatuses = (characterId: string, blockId: string): string[] => {
  const { character } = getLoadedCharacter(characterId);
  const block = [
    ...character.blocks,
    ...character.artifactSet.blocks,
    ...character.weapon.blocks,
  ].find((entry) => entry.id === blockId);
  if (!block || block.type !== 'bonus') {
    return [];
  }
  const needsUp = Object.entries(block.while ?? {})
    .filter(
      ([, bounds]) =>
        (bounds.gte !== undefined && bounds.gte >= 1) ||
        (bounds.gt !== undefined && bounds.gt >= 0)
    )
    .map(([id]) => id);
  return [...needsUp, ...(block.perStack ?? []).map(({ state }) => state)];
};

// How long the statuses that time a bonus still last at `time` (s), just
// before it: the first to end; null when none of them is a status that is
// up. One the hit itself uses up shows the time it had left.
const getRemaining = (
  activity: ActivityLog | undefined,
  statusIds: string[],
  time: number
): number | null => {
  const frame = time * FRAMES_PER_SECOND;
  const before = frame - 0.5;
  const ends = statusIds.flatMap((id) => {
    // Each application on its own (a refresh does not extend the one up),
    // or each stack.
    const intervals = [
      ...(activity?.applications?.[id] ?? []),
      ...(activity?.stacks[id] ?? []).map((stack) => ({
        ...stack,
        until: stack.end,
      })),
    ].filter(({ start, end }) => start <= before && before < end);
    // Removed on this very frame (used up by the hit): its own expiry.
    const endOf = ({ end, until }: { end: number; until: number }) =>
      end > frame ? end : until;
    // The one applied last (a stack status: until its last stack).
    return intervals.length > 0 ? [Math.max(...intervals.map(endOf))] : [];
  });
  return ends.length > 0
    ? Math.max(0, Math.min(...ends) / FRAMES_PER_SECOND - time)
    : null;
};

// The bonuses one hit got, its own and its teammates', each with its value
// on that hit and how long it had left.
export const getHitBonuses = (
  run: TeamRun,
  member: TeamMemberRun,
  hit: HitLogEntry,
  totalHits = 1
): ActionBonus[] =>
  (hit.effectIds ?? []).flatMap((effectId): ActionBonus[] => {
    // Elemental resonance: the team's, permanent.
    const resonance = RESONANCES[effectId as keyof typeof RESONANCES] ?? null;
    if (resonance) {
      const note = hit.notes
        .split('; ')
        .find((entry) => entry.startsWith(resonance.label));
      return [
        {
          id: effectId,
          label: resonance.label,
          from: 'Team',
          source: 'resonance',
          iconUrl: null,
          value: note ? note.slice(resonance.label.length).trim() : '',
          hits: 1,
          totalHits,
          time: hit.time,
          remaining: null,
          element: resonance.element,
        },
      ];
    }
    // A teammate's buff: "<their id>/<block id>".
    const slash = effectId.indexOf('/');
    const giverId = slash < 0 ? member.characterId : effectId.slice(0, slash);
    const blockId = slash < 0 ? effectId : effectId.slice(slash + 1);
    const giver = run.members.find((entry) => entry.characterId === giverId);
    const block = giver?.activity?.blocks.find((entry) => entry.id === blockId);
    if (!giver || !block) {
      return [];
    }
    const label = slash < 0 ? block.label : `${giver.name}: ${block.label}`;
    const note = hit.notes.split('; ').find((entry) => entry.startsWith(label));
    return [
      {
        id: effectId,
        label: block.label,
        from: giver.name,
        source: block.source,
        iconUrl: getBlockIconUrl(getLoadedCharacter(giverId).character, block),
        value: describeBonusValue(
          note ? note.slice(label.length).trim() : block.effectShort ?? '',
          findBonusBlock(giverId, blockId)
        ),
        hits: 1,
        totalHits,
        time: hit.time,
        remaining: getRemaining(
          giver.activity,
          getTimingStatuses(giverId, blockId),
          hit.time
        ),
      },
    ];
  });

// The bonuses a rotation block's hits got, its own and its teammates'
// (each from its first hit, counting the hits it applied to).
export const getActionBonuses = (
  run: TeamRun,
  blockUid: string
): ActionBonus[] => {
  const hits = run.members.flatMap((member) =>
    member.hitLog
      .filter((hit) => hit.blockUid === blockUid)
      .map((hit) => ({ member, hit }))
  );
  const found = new Map<string, ActionBonus>();
  hits.forEach(({ member, hit }) => {
    getHitBonuses(run, member, hit, hits.length).forEach((bonus) => {
      const existing = found.get(bonus.id);
      if (existing) {
        existing.hits += 1;
      } else {
        found.set(bonus.id, bonus);
      }
    });
  });
  return Array.from(found.values());
};

// The stats of whoever dealt an action's first hit, at that hit: the
// scaling stat with every buff, CRIT and DMG Bonus.
export type ActionStats = {
  name: string;
  statLabel: string;
  stat: number;
  critRate: number;
  critDamage: number;
  // %.
  dmgBonus: number;
};

export const STAT_LABELS: Record<string, string> = {
  atk: 'ATK',
  hp: 'HP',
  def: 'DEF',
};

export const getActionStats = (
  run: TeamRun,
  blockUid: string
): ActionStats | null => {
  for (const member of run.members) {
    const hit = member.hitLog.find(
      (entry) => entry.blockUid === blockUid && entry.stat !== undefined
    );
    if (hit && hit.stat !== undefined) {
      const { scalingStat } = getLoadedCharacter(member.characterId).character;
      return {
        name: member.name,
        statLabel: STAT_LABELS[scalingStat] ?? scalingStat,
        stat: hit.stat,
        critRate: hit.critRate,
        critDamage: hit.critDamage ?? 0,
        dmgBonus: hit.totalBonus,
      };
    }
  }
  return null;
};

// The simulation inspectors' test, apart from the team's rotation:
// Chevreuse Q, Chevreuse hold E, Iansan E and Iansan Q, again whenever
// they are ready, for 60 s (CRITs rolled). Steps of a member not in
// `members` are left out.
export const INSPECTOR_TEST_IDS = ['chevreuse', 'iansan'];

const INSPECTOR_TEST_ROTATION: [string, string][] = [
  ['chevreuse', 'burst'],
  ['chevreuse', 'skillHold'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
];

export const runInspectorTest = (members: SimulationValues[]): TeamRun => {
  const ids = members.map((values) => values.character);
  return runTeam(
    {
      members: members.map((values) => ({
        ...values,
        numbers: { ...values.numbers, duration: '60' },
      })),
      rotation: {
        loop: true,
        blocks: INSPECTOR_TEST_ROTATION.filter(([id]) => ids.includes(id)).map(
          ([id, action]) => createTeamBlock(toTeamActionId(id, action))
        ),
      },
      fillWhileWaiting: false,
      swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
    },
    'random'
  );
};
