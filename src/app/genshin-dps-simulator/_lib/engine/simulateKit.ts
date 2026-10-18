import { renderDetails } from './details';
import { createKitAdapter, KitAction } from './kitAdapter';
import { createRuntime, KitRuntime } from './runtime';
import { getLoadedVariant, LoadedCharacter } from '../characterData';
import { FRAMES_PER_SECOND } from '../frames';
import { readNumber } from '../readValue';
import { getRotationActions } from '../rotation/blocks';
import { playRotation } from '../rotation/sequencePlayer';
import {
  CharacterDefinition,
  CharacterSimulationResult,
  CooldownTrack,
  DamageContext,
  ParsedValues,
} from '../types';

// The simulation of a character written entirely as data: its talents'
// timed rows, its blocks and systems, its automatic list and its details.
export const simulateLoadedCharacter = (
  { character, actions, rotation }: LoadedCharacter,
  context: DamageContext,
  values: ParsedValues
): CharacterSimulationResult => {
  const rotationActions = rotation ? getRotationActions(rotation) : [];
  const durationFrames =
    Math.max(1, readNumber(values, 'duration')) * FRAMES_PER_SECOND;

  const runtime = createRuntime({ character, values, context, actions });
  const adapter = createKitAdapter({
    character,
    actions,
    rotationActions,
    runtime,
    durationFrames,
  });

  const rotationTrace = playRotation<KitAction>(adapter, {
    rotation: values.rotation ?? null,
    actions: rotationActions,
    durationFrames,
  });
  // Whatever is still pending (ticks, delayed hits) up to the end.
  runtime.queue.runUntil(Number.POSITIVE_INFINITY, durationFrames);

  return {
    rotationTrace,
    ...collectRunResult({ character, actions }, runtime, durationFrames),
  };
};

// What a finished run reports besides its trace: cooldown tracks, details
// and the activity log.
export const collectRunResult = (
  { character, actions }: Pick<LoadedCharacter, 'character' | 'actions'>,
  runtime: KitRuntime,
  durationFrames: number
): Omit<CharacterSimulationResult, 'rotationTrace'> => {
  // One track per cooldown, named after its first action (a hold E
  // shares the E's).
  const cooldownIds = Array.from(
    new Set(
      Object.values(actions)
        .filter((action) => action.cooldown)
        .map((action) => action.cooldownId)
    )
  );
  const cooldowns: CooldownTrack[] = cooldownIds.map((id) => ({
    actionId: id,
    label:
      Object.values(actions).find((action) => action.cooldownId === id)
        ?.shortLabel ?? id,
    events: runtime.getCooldownEvents().get(id) ?? [],
    holds: runtime.getCooldownHolds().get(id) ?? [],
  }));
  return {
    cooldowns,
    details: renderDetails(character.details, runtime, durationFrames),
    activity: runtime.finishActivity(durationFrames),
  };
};

export const createKitSimulator =
  (characterId: string): CharacterDefinition['simulate'] =>
  (context, values) =>
    simulateLoadedCharacter(
      getLoadedVariant(characterId, {
        weapon: values.weapon,
        artifactSet: values.artifactSet,
      }),
      context,
      values
    );
