// The inspector's view of a Simulate run: the rotation that was executed
// and, above it on the same time axis, the blocks each action made (a
// trigger firing, a status, a stack), one chip each. No DMG.
import { getBlockIconUrl } from './activitySources';
import { getLoadedCharacter } from './characterData';
import { CharacterData } from './characterSchema';
import { conditionSpans } from './conditionSpans';
import { causeId } from './engine/eventLog';
import { expandSystems } from './engine/modules';
import { BOND_OF_LIFE_ID } from './engine/modules/bondOfLife';
import {
  NIGHTSOUL_BLESSING_ID,
  NIGHTSOUL_ID,
} from './engine/modules/nightsoul';
import { ActivityBlock } from './engine/runtime';
import formatNumber from './formatNumber';
import { FRAMES_PER_SECOND } from './frames';
import { isAmplifyingReaction, TRANSFORMATIVE_REACTIONS } from './reactions';
import { getDeadWait } from './rotation/timelineLayout';
import { TeamRun } from './team';
import { CritMode, HitLogEntry } from './types';

const toSeconds = (frame: number) => frame / FRAMES_PER_SECOND;

// Seconds an instant chip (a trigger firing) takes on the axis, so it can
// be read; spans shorter than that get it too.
export const MIN_CHIP_SECONDS = 1.6;

// What a block does: the inspector groups and colors blocks by this, and
// shows where they come from as a tag (E, Q, C2, A4, Weapon…).
export type BlockType =
  | 'bonus'
  | 'debuff'
  | 'extraHit'
  | 'heal'
  | 'energy'
  | 'cooldown'
  | 'state'
  // A block that hits on its own (a status's ticks: Escoffier's Mek,
  // Arlecchino's Directive): a coordinated attack.
  | 'coordinated'
  // The Nightsoul system (any Natlan character): Blessing and points.
  | 'nightsoul'
  // The Bond of Life system: its value (% of Max HP) while above 0.
  | 'bondOfLife';

// `end`: when it went (cut short if removed); `until`: when it would run
// out, which is all that is known while it is up.
export type Renewal = {
  start: number;
  end: number | null;
  until?: number | null;
};

// When an application up at `time` runs out, as known at `time`: its own
// expiry (a later removal is not known yet).
export const timerEnd = (renewal: Renewal): number | null =>
  renewal.until ?? renewal.end;

// The application up at `time`: the latest one started by then.
export const spanAt = (
  span: { start: number; end: number | null; renewals?: Renewal[] },
  time: number
): Renewal =>
  [...(span.renewals ?? [])]
    .reverse()
    .find((renewal) => renewal.start <= time + 1e-6) ?? {
    start: span.start,
    end: span.end,
  };

export type BlockChip = {
  key: string;
  type: BlockType;
  // The rotation step whose play made it (`causeId`), when one did.
  cause?: string | null;
  // Where it comes from: E, Q, Normal, CA, C1-C6, A1/A4, Weapon, Set…
  sourceTag: string;
  // The in-game name and text of where it comes from (the constellation,
  // passive, weapon passive, set bonus or talent), word for word.
  sourceName?: string | null;
  sourceText?: string | null;
  // 'extraHit': its hits ("2 × 120% ATK Pyro") and when they land.
  hitText?: string;
  lands?: number;
  // Who owns the block, and who holds it (a stack given to the member on
  // the field).
  characterId: string;
  holder: string | null;
  // 'stacks': one block for a run of stacks of one status (each with its
  // own timer), from its first stack until its last one runs out.
  // 'particles': flying from when they are made until they are caught
  // (`particles` says how many, of what element).
  // 'heal': what a heal does (HP is not simulated).
  kind: 'trigger' | 'status' | 'stacks' | 'particles' | 'heal';
  particles?: { count: number; element: string };
  label: string;
  // What it gives, from the bonuses that read it ("+20%"); null when no
  // bonus reads it.
  value: string | null;
  // The full description, for the tooltip.
  effect: string | null;
  source: string;
  iconUrl: string | null;
  start: number;
  // Statuses and stacks: when it ended (null: instant, a trigger).
  end: number | null;
  // An instant block's time in the queue: the end of the action that made
  // it (a hit halfway through a Charged Attack stays until it ends).
  until?: number | null;
  // 'heal': whom it heals (null: the whole party), and the amount in short.
  healed?: string | null;
  short?: string | null;
  // 'heal' over time: each tick's time (the block runs from the action
  // that started it until its last tick).
  ticks?: number[];
  // 'stacks': each stack's span, and how many count at once.
  stacks?: { start: number; end: number }[];
  max?: number;
  // Row on the axis, so chips never cover each other.
  lane: number;
  // 'nightsoul': its points over time, their max, and Nightsoul Bursts.
  points?: { time: number; value: number }[];
  bursts?: number[];
  // A trigger's block only shows when one of its ops ran; internal timers
  // (a status only there to fire a trigger when it ends) never show.
  hasOp?: boolean;
  hidden?: boolean;
  // A cooldown reset: while it lasts, an action does not go on cooldown
  // (a form of it with a waived cooldown, Chevreuse's C4).
  resets?: boolean;
  // A status applied again while up: each application (its block shows
  // the latest one so far, never a future one).
  renewals?: Renewal[];
  // An artifact set's block: each of its bonuses, with its own span.
  parts?: {
    // Its bonus' block id: one line per bonus, however often it was up.
    key: string;
    label: string;
    value: string;
    start: number;
    end: number | null;
    renewals?: Renewal[];
  }[];
  // The UI flag of the op that made it (a C6 heal): its source tag.
  flag?: string | null;
  // The file block it comes from.
  blockId?: string;
  // A bonus while a resource meets a bound (Crimson Moon's Semblance while
  // Bond of Life ≥ 30%): that resource is its timer, its value over time
  // against the bound.
  meter?: {
    resource: string;
    label: string;
    bounds: { gt?: number; gte?: number; lt?: number; lte?: number };
    points: { time: number; value: number }[];
    max: number | null;
    format: 'percent' | null;
  };
};

const DEBUFF_STATS = new Set(['resShred', 'defReduction', 'defIgnore']);

// The source tag of an action key ("skill", "elementalSkill/hold"…).
const tagOfKey = (key: string): string | null => {
  if (/(^|[:/])(skill|elementalSkill|skillHold)/.test(key)) {
    return 'E';
  }
  if (/(^|[:/])(burst|elementalBurst)/.test(key)) {
    return 'Q';
  }
  if (/(^|[:/])normal/.test(key)) {
    return 'Normal';
  }
  if (/(^|[:/])charged/.test(key)) {
    return 'CA';
  }
  if (/(^|[:/])plunge/.test(key)) {
    return 'Plunge';
  }
  return null;
};

const HEAL_FROM_TAGS: Record<string, string> = {
  normal: 'Normal',
  charged: 'CA',
  plunge: 'Plunge',
  skill: 'E',
  burst: 'Q',
  passive: 'Passive',
  constellation: 'Const.',
  weapon: 'Weapon',
  artifact: 'Set',
};

export type ActionPiece = {
  key: string;
  // This play of its step (what the blocks it made point to).
  causeId: string;
  // Its team action id ("chevreuse:skillHold").
  actionId: string;
  // What the chart shows it as: its block's sequence when it is one
  // (Mualani's Shark Bite, played as a Normal Attack), else `actionId`.
  shownActionId: string;
  // The form it was played as, if one (Varesa's E in Fiery Passion:
  // "varesa:fieryRush"); null when it was the action itself.
  performedActionId: string | null;
  characterId: string;
  // Its rotation block (its hits carry it).
  blockUid: string;
  label: string;
  // Normal Attack: its place in the combo (0 = N1); null for other actions.
  comboIndex: number | null;
  start: number;
  end: number;
  // Not performed (no Energy, a failed requirement): it stays where it
  // was put, with `warning` saying why.
  skipped: boolean;
  // What went wrong or was waited for (the trace's warning).
  warning: string | null;
  // Seconds it waited for its cooldown before `start` (dead time: the
  // chart's grey stretch, from where it was put).
  waited: number;
  // Played as a form whose status ended during it with its repeated hits
  // still going (spins past the Flamestrider): when (s), and its hits
  // before and after.
  formEnd?: { at: number; within: number; after: number };
  // Played as a form that lasts while a status: when that status ended
  // (s) and its name, for how long a hold of it can go (the editor).
  formEnds?: { at: number; label: string };
};

// A hit on the enemy, and the enemy's aura after a hit.
export type EnemyHit = {
  // Its place in its member's hit log (the full entry, for its breakdown).
  index: number;
  time: number;
  characterId: string;
  blockUid: string | null;
  // The talent row it was dealt from, and the action that dealt it.
  row: string | null;
  actionId: string | null;
  label: string;
  element: string;
  reaction: string;
  // A transformative reaction's own hit has the reaction as its category.
  category: string;
  damage: number;
  isCrit: boolean;
  // False past the counted duration: shown, not added up.
  counted: boolean;
  // The block that made it (a status's tick, a trigger's hit), if one did.
  sourceId: string | null;
  // Made by a block, not by an action's own row, and not a reaction's own
  // hit: a coordinated attack (Escoffier's Mek, Nicole's projections).
  coordinated: boolean;
};

// Each reaction's own hits up to `time`: how many, their total DMG and
// the last one (transformative reactions such as Overloaded deal a hit of
// their own).
export const reactionsUntil = (
  hits: EnemyHit[],
  time: number
): { reaction: string; count: number; damage: number; last: EnemyHit }[] => {
  const byReaction = new Map<
    string,
    { reaction: string; count: number; damage: number; last: EnemyHit }
  >();
  hits.forEach((hit) => {
    if (
      !hit.counted ||
      hit.time > time + 1e-6 ||
      hit.reaction === 'None' ||
      hit.category !== hit.reaction
    ) {
      return;
    }
    const entry = byReaction.get(hit.reaction) ?? {
      reaction: hit.reaction,
      count: 0,
      damage: 0,
      last: hit,
    };
    entry.count += 1;
    entry.damage += hit.damage;
    entry.last = hit;
    byReaction.set(hit.reaction, entry);
  });
  return Array.from(byReaction.values());
};

// Reactions with no hit of their own (Lunar-Bloom gives Verdant Dew) up to
// `time`, from the aura's record: how many of each.
export const eventReactionsUntil = (
  auras: AuraPoint[],
  time: number
): { reaction: string; count: number }[] => {
  const counts = new Map<string, number>();
  auras.forEach((point) => {
    if (
      point.reaction &&
      point.time <= time + 1e-6 &&
      !TRANSFORMATIVE_REACTIONS.includes(point.reaction) &&
      !isAmplifyingReaction(point.reaction)
    ) {
      counts.set(point.reaction, (counts.get(point.reaction) ?? 0) + 1);
    }
  });
  return Array.from(counts, ([reaction, count]) => ({ reaction, count }));
};

export type AuraPoint = {
  time: number;
  element: string;
  gauge: number;
  // Units lost per second.
  decay: number;
  reaction: string | null;
  // The element of the hit that left it (or reacted with it).
  hitElement: string;
};

// The enemy the inspectors show (the dummy's portrait and name).
export const INSPECTOR_ENEMY = {
  name: 'Ruin Guard',
  icon: 'UI_MonsterIcon_Defender_Noner_01',
};

export type InspectorView = {
  // How long the run played (s), and the part of it that counts.
  duration: number;
  countedDuration: number;
  // Rolled CRITs (each hit crits or not), or every hit's average.
  critMode: CritMode;
  chips: BlockChip[];
  lanes: number;
  actions: ActionPiece[];
  // When a chip or an action starts (for stepping).
  stepTimes: number[];
  // The enemy: every hit it took, and its aura over time.
  hits: EnemyHit[];
  auras: AuraPoint[];
};

// The enemy's aura at `time`: what is left of the last one applied.
export const auraAt = (
  auras: AuraPoint[],
  time: number
): {
  element: string;
  gauge: number;
  goneIn: number;
  // How long it lasted from its last change (for a bar of the time left).
  total: number;
} | null => {
  const last = [...auras].reverse().find((point) => point.time <= time + 1e-6);
  if (!last) {
    return null;
  }
  const gauge = last.gauge - last.decay * (time - last.time);
  if (gauge <= 1e-6) {
    return null;
  }
  return {
    element: last.element,
    gauge,
    goneIn: last.decay > 0 ? gauge / last.decay : Number.POSITIVE_INFINITY,
    total: last.decay > 0 ? last.gauge / last.decay : Number.POSITIVE_INFINITY,
  };
};

// DMG the enemy took up to `time`.
// The coordinated attacks up to `time`, per source (member and block):
// how many hits landed and their DMG, and when the next one lands (null:
// none left).
export type CoordinatedSource = {
  characterId: string;
  sourceId: string;
  label: string;
  element: string;
  hits: number;
  damage: number;
  nextAt: number | null;
};

export const coordinatedUntil = (
  view: Pick<InspectorView, 'hits'>,
  time: number
): CoordinatedSource[] => {
  const sources = new Map<string, CoordinatedSource>();
  view.hits.forEach((hit) => {
    if (!hit.coordinated || !hit.sourceId) {
      return;
    }
    const key = `${hit.characterId}|${hit.sourceId}`;
    const source = sources.get(key) ?? {
      characterId: hit.characterId,
      sourceId: hit.sourceId,
      label: hit.label,
      element: hit.element,
      hits: 0,
      damage: 0,
      nextAt: null,
    };
    if (hit.time <= time + 1e-6) {
      source.hits += 1;
      source.damage += hit.counted ? hit.damage : 0;
    } else if (source.nextAt === null || hit.time < source.nextAt) {
      source.nextAt = hit.time;
    }
    sources.set(key, source);
  });
  return Array.from(sources.values());
};

export const damageUntil = (hits: EnemyHit[], time: number): number =>
  hits.reduce(
    (total, hit) =>
      hit.counted && hit.time <= time + 1e-6 ? total + hit.damage : total,
    0
  );

const allBlocks = (character: CharacterData) => [
  ...character.blocks,
  ...character.weapon.blocks,
  ...character.artifactSet.blocks,
];

// The bonus blocks that read a status (its stacks, or while it is up).
const bonusesReading = (character: CharacterData, statusId: string) =>
  allBlocks(character).filter(
    (block) =>
      block.type === 'bonus' &&
      (block.perStack?.some(({ state }) => state === statusId) ||
        Object.keys(block.while ?? {}).includes(statusId))
  );

// Where a chip sits on the axis: its span, or its minimum width.
export const chipEnd = (chip: Pick<BlockChip, 'start' | 'end'>): number =>
  Math.max(chip.end ?? chip.start, chip.start + MIN_CHIP_SECONDS);

// The in-game name and text behind a source tag.
const getSourceText = (
  character: CharacterData,
  sourceTag: string,
  refinement: number,
  setRowFlag: string | undefined
): { sourceName: string | null; sourceText: string | null } => {
  const constellation = sourceTag.match(/^C([1-6])$/);
  if (constellation) {
    const entry = character.constellations.find(
      (item) => item.level === Number(constellation[1])
    );
    return {
      sourceName: entry?.name ?? null,
      sourceText: entry?.description ?? entry?.effect ?? null,
    };
  }
  const passive = ['A1', 'A4'].indexOf(sourceTag);
  if (passive !== -1) {
    const entry = character.passives[passive];
    return {
      sourceName: entry?.name ?? null,
      sourceText: entry?.description ?? entry?.value ?? null,
    };
  }
  if (sourceTag === 'Weapon') {
    const { passive: weaponPassive } = character.weapon;
    return {
      sourceName: weaponPassive
        ? `${character.weapon.name}: ${weaponPassive.name}`
        : character.weapon.name,
      sourceText:
        weaponPassive?.descriptions[
          Math.min(refinement, weaponPassive.descriptions.length) - 1
        ] ?? null,
    };
  }
  if (sourceTag === 'Set') {
    const { rows } = character.artifactSet;
    const row =
      rows.find((entry) => entry.flag && entry.flag === setRowFlag) ??
      rows[rows.length - 1];
    return {
      sourceName: `${character.artifactSet.name} ${row?.label ?? ''}`.trim(),
      sourceText: row?.value ?? null,
    };
  }
  const kind = { E: 'skill', Q: 'burst', Normal: 'normal', CA: 'normal' }[
    sourceTag
  ];
  const talent = character.talents.find((entry) => entry.kind === kind);
  return {
    sourceName: talent?.name ?? null,
    sourceText: talent?.description ?? null,
  };
};

// A team action id that is a sequence (a block of other actions).
const isSequence = (actionId: string | undefined): actionId is string => {
  // Only team ids ("mualani:sharkBite") name their character.
  if (!actionId?.includes(':')) {
    return false;
  }
  const [characterId, id] = actionId.split(':');
  return Boolean(
    getLoadedCharacter(characterId)?.rotation?.actions.find(
      (action) => action.id === id
    )?.steps
  );
};

// A hit's name by its action; one of several kinds of hit of it (a spin's
// Cyclic hits and its Final) by its talent row ("…Cyclic DMG" → "…Cyclic").
const actionHitLabel = (
  characterId: string,
  actionId: string,
  row: string | undefined
): string | undefined => {
  const { character, actions } = getLoadedCharacter(characterId);
  const action = actions[actionId];
  const rows = new Set((action?.hits ?? []).map((hit) => hit.row));
  if (!action || !row || rows.size < 2) {
    return action?.label;
  }
  const [talentId, rowId] = row.split('/');
  const label = character.talents
    .find((talent) => talent.id === talentId)
    ?.rows.find((entry) => entry.id === rowId)?.label;
  // A generic one ("Skill DMG", the game's name for Xilonen's Q hit) says
  // less than the action's.
  return label && !/^(Elemental )?(Skill|Burst) DMG$/.test(label)
    ? label.replace(/\s+DMG$/, '')
    : action.label;
};

export const buildInspectorView = (
  run: TeamRun,
  // Each member's weapon refinement (its passive's text).
  refinements: Record<string, number> = {}
): InspectorView => {
  const limit = run.duration * FRAMES_PER_SECOND;
  const members = new Map(
    run.members.map((member) => {
      const { character } = getLoadedCharacter(member.characterId);
      const blocks = new Map(
        (member.activity?.blocks ?? []).map((block) => [block.id, block])
      );
      return [
        member.characterId,
        { character, activity: member.activity, blocks },
      ];
    })
  );

  // A status spent from a resource (a `drain`), or living inside one that
  // is (Mavuika's Flamestrider within the Blessing): that resource is its
  // timer, not a fixed duration, so its bar follows it down to 0.
  const statusBlocks = new Map(
    run.members.map((member) => {
      const { character } = getLoadedCharacter(member.characterId);
      return [
        member.characterId,
        [...expandSystems(character), ...character.blocks],
      ];
    })
  );
  const drainedResource = (
    characterId: string,
    statusId: string,
    depth = 0
  ): string | null => {
    const block = statusBlocks
      .get(characterId)
      ?.find((entry) => entry.id === statusId);
    if (!block || block.type !== 'status' || depth > 4) {
      return null;
    }
    if (block.drain) {
      return block.drain.resource;
    }
    return block.endsWith
      ? drainedResource(characterId, block.endsWith, depth + 1)
      : null;
  };
  const drainMeter = (
    characterId: string,
    statusId: string
  ): Pick<BlockChip, 'meter'> => {
    const resource = drainedResource(characterId, statusId);
    const member = members.get(characterId);
    const log = resource ? member?.activity?.resources[resource] : undefined;
    if (!resource || !member || !log) {
      return {};
    }
    const resourceBlock = member.blocks.get(resource);
    return {
      meter: {
        resource,
        label: resourceBlock?.label ?? resource,
        bounds: { gt: 0 },
        points: log.map((entry) => ({
          time: toSeconds(entry.frame),
          value: entry.value,
        })),
        max: resourceBlock?.max ?? null,
        format: resourceBlock?.format ?? null,
      },
    };
  };

  // Its value and description: the first bonus that reads it.
  const describe = (
    characterId: string,
    block: ActivityBlock
  ): Pick<BlockChip, 'value' | 'effect'> => {
    const member = members.get(characterId);
    if (!member || block.type !== 'status') {
      return { value: null, effect: block.effect ?? null };
    }
    const bonus = bonusesReading(member.character, block.id)
      .map((entry) => member.blocks.get(entry.id))
      .find((entry) => entry?.effectShort);
    return {
      value: bonus?.effectShort ?? null,
      effect: bonus?.effect ?? null,
    };
  };

  // Each logged application and stack, matched with its event in order.
  const used = new Map<string, number>();
  const nextIndex = (key: string) => {
    const index = used.get(key) ?? 0;
    used.set(key, index + 1);
    return index;
  };

  // Only the blocks of members whose actions are in the rotation (a
  // teammate's Nightsoul Burst, fired by their hits, is left out).
  const actors = new Set(run.trace.map((entry) => entry.action.split(':')[0]));

  const chips: Omit<BlockChip, 'lane'>[] = [];
  // The last firing of each trigger (its ops mark it), and Nightsoul Bursts.
  const lastTrigger = new Map<string, Omit<BlockChip, 'lane'>>();
  const openStatuses = new Map<string, Omit<BlockChip, 'lane'>>();
  const nightsoulBursts = new Map<string, number[]>();
  const openStacks = new Map<string, Omit<BlockChip, 'lane'>>();
  // When each trigger last fired, and the heal blocks it opened.
  const firedAt = new Map<string, number>();
  const openHeals = new Map<
    string,
    { firedAt: number; chip: Omit<BlockChip, 'lane'> }
  >();
  run.events.forEach((event) => {
    const member = members.get(event.characterId);
    const block = event.blockId ? member?.blocks.get(event.blockId) : undefined;
    if (!member || !block || !actors.has(event.characterId)) {
      return;
    }
    // The Nightsoul system's own blocks make its one Nightsoul block.
    if (
      block.id === NIGHTSOUL_BLESSING_ID ||
      block.id.startsWith('nightsoul-')
    ) {
      if (event.kind === 'trigger' && block.id.startsWith('nightsoul-burst')) {
        nightsoulBursts.set(event.characterId, [
          ...(nightsoulBursts.get(event.characterId) ?? []),
          toSeconds(event.frame),
        ]);
      }
      return;
    }
    if (event.kind === 'op') {
      const fired = lastTrigger.get(`${event.characterId}/${block.id}`);
      if (fired) {
        fired.hasOp = true;
      }
      return;
    }
    const base = {
      key: `${event.characterId}#${event.seq}`,
      cause: event.cause ?? null,
      blockId: block.id,
      type: 'state' as BlockType,
      sourceTag: '',
      characterId: event.characterId,
      label: block.label,
      source: block.source,
      iconUrl: getBlockIconUrl(member.character, block),
      start: toSeconds(event.frame),
    };
    // A trigger that only adds stacks or statuses shows as those.
    const trigger = member.character.blocks
      .concat(
        member.character.weapon.blocks,
        member.character.artifactSet.blocks
      )
      .find((entry) => entry.id === block.id);
    // …and one that only heals, as its heal block.
    // A trigger that only keeps states and counters (a status on or off, a
    // resource other than Energy up or down) or heals shows as those, not
    // as a block of its own. A resource changed from outside the kit (a
    // weapon's, set's or constellation's Bond of Life) shows as its own
    // block, so what changed the kit's mechanic can be seen.
    const fromKit =
      trigger?.source === 'talent' || trigger?.source === 'passive';
    const onlyStates =
      trigger?.type === 'trigger' &&
      trigger.do.every(
        (op) =>
          'addStack' in op ||
          'applyStatus' in op ||
          'removeStatus' in op ||
          'heal' in op ||
          (fromKit && 'setResource' in op && op.setResource !== 'energy') ||
          (fromKit && 'addResource' in op && op.addResource !== 'energy')
      );
    if (event.kind === 'trigger') {
      firedAt.set(`${event.characterId}/${block.id}`, base.start);
    }
    if (event.kind === 'trigger' && !onlyStates) {
      const chip: Omit<BlockChip, 'lane'> = {
        ...base,
        kind: 'trigger',
        holder: null,
        value: null,
        effect: null,
        end: null,
        hasOp: false,
      };
      lastTrigger.set(`${event.characterId}/${block.id}`, chip);
      chips.push(chip);
    }
    if (event.kind === 'heal') {
      const from = event.detail?.from ? String(event.detail.from) : null;
      const effect = String(event.detail?.effect ?? '');
      // The ticks of one firing of its trigger (same effect) are one block:
      // each heal knows when its own trigger fired.
      const started =
        event.detail?.firedAt !== undefined && event.detail.firedAt !== null
          ? toSeconds(Number(event.detail.firedAt))
          : firedAt.get(`${event.characterId}/${block.id}`);
      const groupKey = `${event.characterId}/${block.id}/${effect}/${started}`;
      const open = openHeals.get(groupKey);
      if (open && started !== undefined && open.firedAt === started) {
        open.chip.ticks?.push(base.start);
        open.chip.end = base.start;
        open.chip.healed = event.detail?.healed
          ? String(event.detail.healed)
          : null;
        return;
      }
      const chip: Omit<BlockChip, 'lane'> = {
        ...base,
        kind: 'heal',
        source: from ?? block.source,
        holder: null,
        value: effect,
        effect,
        healed: event.detail?.healed ? String(event.detail.healed) : null,
        short: event.detail?.short ? String(event.detail.short) : null,
        flag: event.detail?.flag ? String(event.detail.flag) : null,
        start: started ?? base.start,
        end: base.start,
        ticks: [base.start],
      };
      openHeals.set(groupKey, { firedAt: started ?? base.start, chip });
      chips.push(chip);
      return;
    }
    if (event.kind === 'particles') {
      const count = Number(event.detail?.count ?? 0);
      const element = String(event.detail?.element ?? '');
      const particles = {
        kind: 'particles' as const,
        particles: { count, element },
        value: `${Math.round(count * 100) / 100} ${
          element === 'clear' ? 'clear' : element
        } particle${count === 1 ? '' : 's'}`,
        end: toSeconds(Number(event.detail?.arrives ?? event.frame)),
      };
      // The trigger that made them becomes the particles' block.
      const trigger = [...chips]
        .reverse()
        .find(
          (chip) =>
            chip.kind === 'trigger' &&
            chip.characterId === event.characterId &&
            chip.start === base.start &&
            chip.key.startsWith(`${event.characterId}#`) &&
            chip.label === block.label
        );
      if (trigger) {
        Object.assign(trigger, particles);
      } else if (count > 0) {
        chips.push({
          ...base,
          ...particles,
          holder: null,
          effect: null,
        });
      }
      return;
    }
    if (event.kind === 'stack.add') {
      const logged =
        member.activity?.stacks[block.id]?.[
          nextIndex(`${event.characterId}/stack/${block.id}`)
        ];
      if (!logged) {
        return;
      }
      const holder = event.detail?.holder ? String(event.detail.holder) : null;
      const stack = {
        start: toSeconds(logged.start),
        end: toSeconds(Math.min(logged.end, limit)),
      };
      // Joins the open block of this status (and holder) while one of its
      // stacks is still up; else it opens a new one.
      const groupKey = `${event.characterId}/${block.id}/${holder}`;
      const open = openStacks.get(groupKey);
      if (open && open.end !== null && stack.start < open.end) {
        open.stacks?.push(stack);
        open.end = Math.max(open.end, stack.end);
        return;
      }
      const chip: Omit<BlockChip, 'lane'> = {
        ...base,
        ...describe(event.characterId, block),
        kind: 'stacks',
        holder,
        start: stack.start,
        end: stack.end,
        stacks: [stack],
        max: block.stackMax ?? 1,
      };
      openStacks.set(groupKey, chip);
      chips.push(chip);
    }
    if (event.kind === 'status.apply' || event.kind === 'status.refresh') {
      const application =
        member.activity?.applications[block.id]?.[
          nextIndex(`${event.characterId}/status/${block.id}`)
        ];
      const end = application
        ? toSeconds(Math.min(application.end, limit))
        : null;
      const until = application
        ? toSeconds(Math.min(application.until, limit))
        : null;
      // Refreshed (or applied again) while its block is still up: the same
      // block, with its new end.
      const statusKey = `${event.characterId}/${block.id}`;
      const open = openStatuses.get(statusKey);
      if (open && (open.end === null || open.end > base.start)) {
        open.end =
          end === null || open.end === null ? null : Math.max(open.end, end);
        open.renewals?.push({ start: base.start, end, until });
        return;
      }
      const chip: Omit<BlockChip, 'lane'> = {
        ...base,
        ...describe(event.characterId, block),
        kind: 'status',
        holder: null,
        end,
        renewals: [{ start: base.start, end, until }],
        ...drainMeter(event.characterId, block.id),
      };
      openStatuses.set(statusKey, chip);
      chips.push(chip);
    }
  });

  // What each block does, and where it comes from.
  const classify = (chip: Omit<BlockChip, 'lane'>) => {
    const { character } = getLoadedCharacter(chip.characterId);
    const blocks = allBlocks(character);
    const blockId = chip.blockId ?? '';
    const definition = blocks.find((entry) => entry.id === blockId);
    const triggers = blocks.filter((entry) => entry.type === 'trigger');
    // The trigger that applies a status (for a status' source tag).
    const applier =
      definition?.type === 'trigger'
        ? definition
        : triggers.find((entry) =>
            JSON.stringify(entry.do).match(
              new RegExp(`"(applyStatus|addStack)":"${blockId}"`)
            )
          );
    const flag = chip.flag ?? definition?.ifFlag ?? applier?.ifFlag;
    const sourceTag = (() => {
      const constellation = flag?.match(/^c([1-6])$/);
      if (constellation) {
        return `C${constellation[1]}`;
      }
      if (chip.kind === 'heal' && chip.source in HEAL_FROM_TAGS) {
        return HEAL_FROM_TAGS[chip.source];
      }
      const source = definition?.source ?? chip.source;
      if (source === 'passive') {
        const index = character.passives.findIndex(
          (passive) =>
            (passive.toggleFlag && passive.toggleFlag === flag) ||
            chip.label.includes(passive.name)
        );
        return ['A1', 'A4'][index] ?? 'Passive';
      }
      if (source === 'weapon') {
        return 'Weapon';
      }
      if (source === 'artifact') {
        return 'Set';
      }
      if (source === 'system') {
        return 'System';
      }
      const when = applier?.type === 'trigger' ? applier.when : undefined;
      const key =
        when && ('use' in when ? when.use : 'hit' in when ? when.hit : null);
      return (key && tagOfKey(key)) || 'Talent';
    })();

    if (chip.kind === 'heal') {
      return { type: 'heal' as const, sourceTag };
    }
    if (chip.kind === 'particles') {
      return { type: 'energy' as const, sourceTag };
    }
    // A talent row's name ("elementalSkill/frosty-parfait" → its label).
    const rowLabelOf = (ref: string) => {
      const [talentId, rowId] = ref.split('/');
      const talent = character.talents.find((entry) => entry.id === talentId);
      return talent?.rows.find((row) => row.id === rowId)?.label ?? ref;
    };
    // A status that hits on its own: a coordinated attack.
    if (definition?.type === 'status' && definition.ticks) {
      const { ticks } = definition;
      return {
        type: 'coordinated' as const,
        sourceTag,
        hitText: `${ticks.count} × ${rowLabelOf(ticks.row)} ${ticks.element}`,
      };
    }
    if (chip.kind === 'trigger') {
      const hits =
        definition?.type === 'trigger'
          ? definition.do.flatMap((op) => ('hit' in op ? [op.hit] : []))
          : [];
      if (hits.length === 0) {
        return { type: 'state' as const, sourceTag };
      }
      const [first] = hits;
      const what =
        first.multiplier !== undefined
          ? `${first.multiplier}% ATK`
          : first.row
          ? rowLabelOf(first.row)
          : 'hit';
      return {
        type: 'extraHit' as const,
        sourceTag,
        hitText: `${hits.length} × ${what} ${
          first.element === 'attacker' ? '' : first.element
        }`.trim(),
        lands: chip.start + (first.afterFrames ?? 0) / FRAMES_PER_SECOND,
      };
    }
    // A bonus while a resource meets a bound: a bonus block of its own.
    if (definition?.type === 'bonus') {
      return {
        type:
          'stat' in definition && DEBUFF_STATS.has(String(definition.stat))
            ? ('debuff' as const)
            : ('bonus' as const),
        sourceTag,
      };
    }
    // A mode: some form's `while` names it, so it changes her actions
    // (Mavuika's Flamestrider), even if a bonus also reads it.
    const isMode = character.talents.some((talent) =>
      talent.forms.some((form) =>
        JSON.stringify(form.while).includes(`"status":"${blockId}"`)
      )
    );
    if (isMode && definition?.type === 'status') {
      return { type: 'state' as const, sourceTag };
    }
    // Statuses and stacks: a bonus reads it, or a trigger waits on it.
    const bonus = bonusesReading(character, blockId)[0];
    if (bonus && bonus.type === 'bonus') {
      return {
        type:
          'stat' in bonus && DEBUFF_STATS.has(String(bonus.stat))
            ? ('debuff' as const)
            : ('bonus' as const),
        sourceTag,
      };
    }
    // A status that turns an action into a form without its cooldown.
    const resets = character.talents.some((talent) =>
      talent.forms.some(
        (form) =>
          (form.cooldown === 'waived' || form.cooldown === 'none') &&
          JSON.stringify(form.while).includes(`"status":"${blockId}"`)
      )
    );
    if (resets) {
      return { type: 'cooldown' as const, sourceTag, resets: true };
    }
    const gates = triggers.some((entry) =>
      JSON.stringify(entry.if ?? {}).includes(`{"not":{"status":"${blockId}"}}`)
    );
    // A clock: a status only there to fire a trigger when it ends.
    const clock =
      !gates &&
      triggers.some(
        (entry) =>
          entry.type === 'trigger' &&
          'statusEnds' in entry.when &&
          entry.when.statusEnds === blockId
      );
    return {
      type: gates ? ('cooldown' as const) : ('state' as const),
      sourceTag,
      hidden: clock,
    };
  };
  // A bonus whose `while` reads a resource (Bond of Life, Wave Momentum):
  // a block while it holds, the resource its timer. One that reads only
  // statuses shows as those statuses. Only the bonuses the run applied
  // (their flag on); two of one name and condition (Masque's infusion and
  // DMG) are one block.
  members.forEach((member, characterId) => {
    const activity = member.activity;
    if (!activity || !actors.has(characterId)) {
      return;
    }
    const seen = new Map<string, Omit<BlockChip, 'lane'>[]>();
    allBlocks(member.character).forEach((block) => {
      if (block.type !== 'bonus' || !block.while) {
        return;
      }
      const resource = Object.keys(block.while).find(
        (id) => id in activity.resources
      );
      if (!resource || !activity.bonusHits[block.id]) {
        return;
      }
      const described = member.blocks.get(block.id);
      const key = `${block.label}|${JSON.stringify(block.while)}`;
      const same = seen.get(key);
      if (same) {
        // The other half's effect, on the same blocks.
        same.forEach((chip) => {
          if (
            described?.effectShort &&
            !chip.value?.includes(described.effectShort)
          ) {
            chip.value = [chip.value, described.effectShort]
              .filter(Boolean)
              .join(' · ');
          }
        });
        return;
      }
      const resourceBlock = member.blocks.get(resource);
      const meter = {
        resource,
        label:
          resource === BOND_OF_LIFE_ID
            ? 'Bond of Life'
            : resourceBlock?.label ?? resource,
        bounds: block.while[resource],
        points: activity.resources[resource].map((entry) => ({
          time: toSeconds(entry.frame),
          value: entry.value,
        })),
        max: resourceBlock?.max ?? null,
        format: resourceBlock?.format ?? null,
      };
      const made = conditionSpans(block.while, activity, limit).map(
        (span, index): Omit<BlockChip, 'lane'> => ({
          key: `${characterId}#while#${block.id}#${index}`,
          blockId: block.id,
          type: 'bonus',
          kind: 'status',
          sourceTag: '',
          characterId,
          holder: null,
          label: block.label,
          source: block.source,
          iconUrl: getBlockIconUrl(member.character, block),
          value: described?.effectShort ?? null,
          effect: described?.effect ?? null,
          start: toSeconds(span.start),
          end: toSeconds(span.end),
          meter,
        })
      );
      seen.set(key, made);
      chips.push(...made);
    });
  });

  chips.forEach((chip) => {
    Object.assign(chip, classify(chip));
    const { character } = getLoadedCharacter(chip.characterId);
    const definition = allBlocks(character).find(
      (entry) => entry.id === chip.blockId
    );
    Object.assign(
      chip,
      getSourceText(
        character,
        chip.sourceTag,
        refinements[chip.characterId] ?? 1,
        chip.flag ?? definition?.ifFlag
      )
    );
  });

  // An artifact set's bonuses are one block per character while any is up:
  // each bonus a line inside it.
  const openSets = new Map<string, Omit<BlockChip, 'lane'>>();
  chips
    .filter(
      (chip) =>
        chip.sourceTag === 'Set' &&
        chip.kind === 'status' &&
        (chip.type === 'bonus' || chip.type === 'debuff') &&
        !chip.hidden
    )
    .sort((a, b) => a.start - b.start)
    .forEach((chip) => {
      const part = {
        key: chip.blockId ?? chip.key,
        label: chip.label,
        value: chip.value ?? chip.label,
        start: chip.start,
        end: chip.end,
        renewals: chip.renewals,
      };
      const open = openSets.get(chip.characterId);
      if (open && (open.end === null || open.end > chip.start)) {
        // A bonus up again while the block lasts (Scroll's 15 s buff ran
        // out, its 20 s one kept the block open) stays its one line, with
        // every application.
        const same = open.parts?.find((entry) => entry.key === part.key);
        if (same) {
          same.end =
            same.end === null || chip.end === null
              ? null
              : Math.max(same.end, chip.end);
          same.renewals = [...(same.renewals ?? []), ...(chip.renewals ?? [])];
        } else {
          open.parts?.push(part);
        }
        open.end =
          open.end === null || chip.end === null
            ? null
            : Math.max(open.end, chip.end);
        chip.hidden = true;
        return;
      }
      const { character } = getLoadedCharacter(chip.characterId);
      Object.assign(chip, {
        label: character.artifactSet.name,
        parts: [part],
      });
      openSets.set(chip.characterId, chip);
    });

  // Each character's Bond of Life: one block per span it is above 0, with
  // its value over time.
  members.forEach((member, characterId) => {
    const resource = member.blocks.get(BOND_OF_LIFE_ID);
    if (!actors.has(characterId) || !resource) {
      return;
    }
    const points = (member.activity?.resources[BOND_OF_LIFE_ID] ?? []).map(
      (entry) => ({ time: toSeconds(entry.frame), value: entry.value })
    );
    let openedAt: number | null = null;
    const close = (end: number) => {
      if (openedAt === null) {
        return;
      }
      chips.push({
        key: `${characterId}#bondOfLife#${openedAt}`,
        blockId: BOND_OF_LIFE_ID,
        type: 'bondOfLife',
        kind: 'status',
        sourceTag: 'System',
        sourceName: resource.label,
        sourceText: null,
        characterId,
        holder: null,
        label: resource.label,
        source: 'system',
        iconUrl: getBlockIconUrl(member.character, resource),
        value: null,
        effect: null,
        start: openedAt,
        end,
        points,
        max: resource.max ?? 0,
      });
      openedAt = null;
    };
    points.forEach((point) => {
      if (point.value > 0 && openedAt === null) {
        openedAt = point.time;
      } else if (point.value <= 0) {
        close(point.time);
      }
    });
    close(run.duration);
  });

  // Each character's Nightsoul: one block per Blessing, with its points.
  members.forEach((member, characterId) => {
    if (!actors.has(characterId) || !member.blocks.has(NIGHTSOUL_ID)) {
      return;
    }
    const resource = member.blocks.get(NIGHTSOUL_ID);
    const blessing = member.blocks.get(NIGHTSOUL_BLESSING_ID);
    const points = (member.activity?.resources[NIGHTSOUL_ID] ?? []).map(
      (entry) => ({ time: toSeconds(entry.frame), value: entry.value })
    );
    const bursts = nightsoulBursts.get(characterId) ?? [];
    (member.activity?.statuses[NIGHTSOUL_BLESSING_ID] ?? []).forEach(
      (interval, index) => {
        const start = toSeconds(interval.start);
        const end = toSeconds(Math.min(interval.end, limit));
        chips.push({
          key: `${characterId}#nightsoul#${index}`,
          blockId: NIGHTSOUL_BLESSING_ID,
          type: 'nightsoul',
          kind: 'status',
          sourceTag: 'Natlan',
          sourceName: blessing?.label ?? "Nightsoul's Blessing",
          sourceText: null,
          characterId,
          holder: null,
          label: blessing?.label ?? "Nightsoul's Blessing",
          source: 'system',
          iconUrl: blessing
            ? getBlockIconUrl(member.character, blessing)
            : null,
          value: null,
          effect: null,
          start,
          end,
          points,
          max: resource?.max ?? 0,
          bursts: bursts.filter((time) => time >= start && time <= end),
          // Spent from its points (a `drain`): they are its timer.
          ...drainMeter(characterId, NIGHTSOUL_BLESSING_ID),
        });
      }
    );
  });

  // A status that stops a special system's points from being spent
  // (Mavuika's Q: `{ not: { status } }` in a drain's or a spending op's
  // `if`): a block of its own with those points, next to the system, so a
  // frozen bar shows why. Its bonuses keep their own block.
  members.forEach((member, characterId) => {
    const activity = member.activity;
    if (!activity || !actors.has(characterId)) {
      return;
    }
    const blocks = statusBlocks.get(characterId) ?? [];
    const paused = new Map<string, { resource: string; spenders: string[] }>();
    const pause = (condition: unknown, resource: string, spender: string) => {
      if (resource !== NIGHTSOUL_ID && resource !== BOND_OF_LIFE_ID) {
        return;
      }
      const statusId = JSON.stringify(condition ?? {}).match(
        /\{"not":\{"status":"([^"]+)"\}\}/
      )?.[1];
      if (!statusId) {
        return;
      }
      const entry = paused.get(statusId) ?? { resource, spenders: [] };
      if (!entry.spenders.includes(spender)) {
        entry.spenders.push(spender);
      }
      paused.set(statusId, entry);
    };
    blocks.forEach((block) => {
      const label = member.blocks.get(block.id)?.label ?? block.label;
      if (block.type === 'status' && block.drain) {
        pause(block.drain.if, block.drain.resource, label);
      }
      if (block.type === 'trigger') {
        block.do.forEach((op) => {
          if (
            'addResource' in op &&
            typeof op.amount === 'number' &&
            op.amount < 0
          ) {
            pause(op.if, op.addResource, label);
          }
        });
      }
    });
    paused.forEach(({ resource, spenders }, statusId) => {
      const status = member.blocks.get(statusId);
      // Its own block (classified above) lends its source and tooltip.
      const own = chips.find(
        (chip) => chip.characterId === characterId && chip.blockId === statusId
      );
      (activity.statuses[statusId] ?? []).forEach((interval, index) => {
        if (interval.start >= limit) {
          return;
        }
        chips.push({
          key: `${characterId}#pause#${statusId}#${index}`,
          blockId: statusId,
          type: 'state',
          kind: 'status',
          sourceTag: own?.sourceTag ?? '',
          sourceName: own?.sourceName ?? null,
          sourceText: own?.sourceText ?? null,
          characterId,
          holder: null,
          label: status?.label ?? statusId,
          source: status?.source ?? 'talent',
          iconUrl: status
            ? getBlockIconUrl(member.character, status)
            : own?.iconUrl ?? null,
          value: `No ${member.blocks.get(resource)?.label ?? resource} spent`,
          effect: `Pauses: ${spenders.join(', ')}.`,
          start: toSeconds(interval.start),
          end: toSeconds(Math.min(interval.end, limit)),
          meter: {
            resource,
            label: member.blocks.get(resource)?.label ?? resource,
            bounds: { gt: 0 },
            points: (activity.resources[resource] ?? []).map((entry) => ({
              time: toSeconds(entry.frame),
              value: entry.value,
            })),
            max: member.blocks.get(resource)?.max ?? null,
            format: member.blocks.get(resource)?.format ?? null,
          },
        });
      });
    });
  });

  // A heal of one tick is instant, at its tick.
  chips.forEach((chip) => {
    if (chip.kind === 'heal' && chip.ticks?.length === 1) {
      Object.assign(chip, { start: chip.ticks[0], end: null });
    }
  });
  // Queue order: by when each block starts (a heal block starts with the
  // action, before its first tick), ties in the order they were made.
  const ordered = chips
    .filter((chip) => !chip.hidden && (chip.kind !== 'trigger' || chip.hasOp))
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => a.chip.start - b.chip.start || a.index - b.index)
    .map(({ chip }) => chip);

  // Rows: each chip in the first one free at its start.
  const laneEnds: number[] = [];
  const placed = ordered.map((chip) => {
    let lane = laneEnds.findIndex((end) => end <= chip.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = chipEnd(chip);
    return { ...chip, lane };
  });

  // The steps that were performed, and the ones skipped (for lack of
  // Energy, say), which made nothing but show where they were put and why.
  const performed = new Set(
    run.events
      .filter((event) => event.kind === 'action.use')
      .map((event) => `${event.detail?.blockUid}@${event.frame}`)
  );
  const actions: ActionPiece[] = run.trace
    .filter(
      (entry) =>
        entry.skipped ||
        performed.has(
          `${entry.blockUid}@${Math.round(entry.startTime * FRAMES_PER_SECOND)}`
        )
    )
    .map((entry, index) => ({
      key: `${entry.blockUid}#${index}`,
      causeId: causeId(entry),
      actionId: entry.action,
      shownActionId: isSequence(entry.blockAction)
        ? entry.blockAction
        : entry.action,
      performedActionId: entry.performedAction ?? null,
      characterId: entry.action.split(':')[0],
      blockUid: entry.blockUid,
      label: entry.label,
      comboIndex: entry.comboIndex ?? null,
      start: entry.startTime,
      end: Math.max(entry.endTime, entry.startTime + 0.05),
      skipped: entry.skipped ?? false,
      warning: entry.warning ?? null,
      waited: getDeadWait(entry),
    }));
  // An action played as a form while a status lasted, then as itself once
  // it ended (Mavuika's Charged Attacks after the Flamestrider): those say
  // so, until it is played as a form again.
  const formEnded = new Map<string, string>();
  actions.forEach((action) => {
    if (action.skipped) {
      return;
    }
    const key = `${action.characterId}/${action.actionId}`;
    if (action.performedActionId) {
      const formId = action.performedActionId.split(':')[1];
      const { character } = getLoadedCharacter(action.characterId);
      const form = character.talents
        .flatMap((talent) => talent.forms)
        .find((entry) => entry.id === formId);
      const statusId = JSON.stringify(form?.while ?? {}).match(
        /"status":"([^"]+)"/
      )?.[1];
      const status = statusId
        ? members.get(action.characterId)?.blocks.get(statusId)
        : undefined;
      if (status && statusId) {
        formEnded.set(key, status.label);
        // It ends during this one (a long spin): its hits after that.
        const member = members.get(action.characterId);
        const startFrame = Math.round(action.start * FRAMES_PER_SECOND);
        const span = member?.activity?.statuses[statusId]?.find(
          (interval) =>
            interval.start <= startFrame && startFrame < interval.end
        );
        const endsAt = span ? toSeconds(span.end) : null;
        if (endsAt !== null) {
          action.formEnds = { at: endsAt, label: status.label };
        }
        const hits =
          endsAt !== null && endsAt < action.end
            ? (
                run.members.find(
                  (entry) => entry.characterId === action.characterId
                )?.hitLog ?? []
              )
                .filter(
                  (hit) =>
                    hit.blockUid === action.blockUid &&
                    hit.actionId === formId &&
                    hit.time >= action.start &&
                    hit.time <= action.end
                )
                .sort((first, second) => first.time - second.time)
            : [];
        // A hit counts in it when it lands before it ends. One on the
        // frame it ends was dealt in it (it may be what ended it:
        // Xilonen's kick that fills her points).
        const within =
          endsAt === null
            ? hits.length
            : hits.filter((hit) => hit.time <= endsAt + 1e-9).length;
        if (endsAt !== null && within < hits.length) {
          const total = hits.length;
          // Repeated hits after it ended (spins past the Flamestrider) are
          // not the form's: the block shows them apart, from when it
          // ended. A closing hit alone (the Final) is.
          const repeated = new Set(
            (getLoadedCharacter(action.characterId).actions[formId]?.hits ?? [])
              .filter((hit) => hit.repeats && hit.row)
              .map((hit) => hit.row)
          );
          const outside = hits
            .slice(within)
            .filter((hit) => repeated.has(hit.row ?? '')).length;
          // Only its closing hit after it (the Final): it is still the
          // form's, nothing to say.
          if (outside > 0) {
            // Its spins past it, apart; its closing hits are the form's.
            action.formEnd = {
              at: endsAt,
              within: total - outside,
              after: outside,
            };
            const range = (from: number, to: number) =>
              from === to ? `${from}` : `${from}–${to}`;
            const closing = total - within - outside;
            const onIt = [
              ...(within > 0 ? [range(1, within)] : []),
              ...(closing > 0 ? [range(within + outside + 1, total)] : []),
            ];
            const warning = `${status.label} ends at ${endsAt.toFixed(2)} s: ${
              onIt.length > 0
                ? `hit${total - outside === 1 ? '' : 's'} ${onIt.join(
                    ' and '
                  )} of ${total} on it, `
                : ''
            }hit${outside === 1 ? '' : 's'} ${range(
              within + 1,
              within + outside
            )} after it`;
            action.warning = action.warning
              ? `${action.warning} · ${warning}`
              : warning;
          }
        }
      } else {
        formEnded.delete(key);
      }
      return;
    }
    const ended = formEnded.get(key);
    if (ended) {
      // The action's own name ("Charged Attack"), not its block's.
      const own = getLoadedCharacter(action.characterId).actions[
        action.actionId.split(':')[1]
      ];
      const warning = `${ended} ended: a plain ${own?.label ?? action.label}`;
      action.warning = action.warning
        ? `${action.warning} · ${warning}`
        : warning;
    }
  });
  const actionEnds = new Map(
    actions.map((action) => [action.causeId, action.end])
  );
  placed.forEach((chip) => {
    const actionEnd = chip.cause ? actionEnds.get(chip.cause) : undefined;
    if (
      chip.end === null &&
      actionEnd !== undefined &&
      actionEnd > chip.start
    ) {
      chip.until = actionEnd;
    }
  });

  return {
    duration: run.duration,
    countedDuration: run.countedDuration,
    critMode: run.critMode,
    hits: run.members
      .flatMap((member) =>
        member.hitLog.map((hit, index) => ({
          index,
          time: hit.time,
          characterId: member.characterId,
          blockUid: hit.blockUid ?? null,
          row: hit.row ?? null,
          actionId: hit.actionId ?? null,
          label:
            (hit.actionId &&
              actionHitLabel(member.characterId, hit.actionId, hit.row)) ||
            (hit.sourceId &&
              // Its own block, else the member's that made it (a hit dealt
              // as the attacker: Nicole's Arcane Projections).
              (members.get(member.characterId)?.blocks.get(hit.sourceId)
                ?.label ??
                Array.from(members.values())
                  .find((other) => other.blocks.has(hit.sourceId ?? ''))
                  ?.blocks.get(hit.sourceId)?.label)) ||
            hit.category,
          element: hit.element,
          reaction: hit.reaction,
          category: hit.category,
          damage: hit.damage,
          isCrit: hit.isCrit,
          counted: hit.counted,
          sourceId: hit.sourceId ?? null,
          coordinated:
            Boolean(hit.sourceId) &&
            !(hit.reaction !== 'None' && hit.category === hit.reaction),
        }))
      )
      .sort((a, b) => a.time - b.time),
    auras: run.events
      .filter((event) => event.kind === 'aura')
      .map((event) => ({
        time: toSeconds(event.frame),
        element: String(event.detail?.element ?? ''),
        gauge: Number(event.detail?.gauge ?? 0),
        decay: Number(event.detail?.decay ?? 0) * FRAMES_PER_SECOND,
        reaction: event.detail?.reaction ? String(event.detail.reaction) : null,
        hitElement: String(event.detail?.hitElement ?? ''),
      })),
    chips: placed,
    lanes: Math.max(1, laneEnds.length),
    actions,
    stepTimes: Array.from(
      new Set([
        ...placed.flatMap((chip) => [
          chip.start,
          ...(chip.stacks ?? []).map((stack) => stack.start),
          ...(chip.ticks ?? []),
        ]),
        ...actions.map((action) => action.start),
      ])
    ).sort((a, b) => a - b),
  };
};

// One step of a hit's DMG formula: what it multiplies by, and the running
// result.
export type FormulaRow = { label: string; value: string; result: string };

const big = (value: number) => formatNumber(Math.round(value));
const factor = (value: number) =>
  formatNumber(Math.round(value * 10000) / 10000);
const percent = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)}%`;

// A hit's DMG, factor by factor, from what the engine logged, and whether
// multiplying them back gives exactly its DMG.
export const getHitFormula = (
  hit: HitLogEntry,
  statLabel: string
): { rows: FormulaRow[]; rebuilt: number; matches: boolean } => {
  const crit = hit.critMultiplier ?? 1;
  const def = hit.defMultiplier ?? 1;
  const res = hit.resMultiplier ?? 1;
  const rows: FormulaRow[] = [];
  let running: number;
  if (hit.reaction !== 'None' && hit.category === hit.reaction) {
    // A transformative reaction's own hit: its base (level × EM bonus),
    // then the enemy's RES only.
    running = hit.baseDamage;
    rows.push({
      label: `${hit.reaction} base DMG`,
      value: '',
      result: big(running),
    });
  } else {
    const stat = hit.stat ?? 0;
    const flat = hit.flatDamage ?? 0;
    running = (stat * hit.multiplier) / 100;
    rows.push({ label: statLabel, value: big(stat), result: big(stat) });
    rows.push({
      label: '× Talent',
      value: percent(hit.multiplier),
      result: big(running),
    });
    if (flat !== 0) {
      running += flat;
      rows.push({
        label: '+ Flat DMG',
        value: big(flat),
        result: big(running),
      });
    }
    running = Math.max(0, running) * Math.max(0, 1 + hit.totalBonus / 100);
    rows.push({
      label: '× DMG Bonus',
      value: `1 + ${percent(hit.totalBonus)}`,
      result: big(running),
    });
    running *= crit;
    rows.push({
      label: '× CRIT',
      value: hit.isCrit
        ? `1 + ${percent((hit.critDamage ?? 0) * 100)}`
        : crit === 1
        ? '1 (no CRIT)'
        : `${factor(crit)} (average)`,
      result: big(running),
    });
    running *= def;
    rows.push({ label: '× DEF', value: factor(def), result: big(running) });
  }
  running *= res;
  rows.push({
    label: `× ${hit.element} RES`,
    value: factor(res),
    result: big(running),
  });
  if (hit.reactionMultiplier !== 1) {
    running *= hit.reactionMultiplier;
    rows.push({
      label: `× ${hit.reaction}`,
      value: factor(hit.reactionMultiplier),
      result: big(running),
    });
  }
  return {
    rows,
    rebuilt: running,
    matches: Math.abs(running - hit.damage) <= 1e-6 * Math.max(1, hit.damage),
  };
};
