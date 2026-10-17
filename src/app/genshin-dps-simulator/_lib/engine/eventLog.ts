// Every change a run makes, in the order the simulation made it: the
// inspector replays it. Logging only: nothing reads it back during a run.
export type SimEventKind =
  | 'action.use'
  | 'hit'
  | 'trigger'
  | 'trigger.skip'
  | 'status.apply'
  | 'status.refresh'
  | 'status.remove'
  | 'stack.add'
  | 'stack.clear'
  | 'resource'
  // Particles made: they fly until `arrives`, then give Energy.
  | 'particles'
  // A heal (HP is not simulated): what it does, to whom.
  | 'heal'
  // An op of a trigger that ran (passed its guards): the trigger did
  // something.
  | 'op'
  // The enemy's aura after a hit: its element, units and how fast it
  // decays (per frame); `reaction` when the hit reacted with it.
  | 'aura';

export type SimEvent = {
  // Order of creation: events of one frame keep the simulation's order.
  seq: number;
  frame: number;
  characterId: string;
  kind: SimEventKind;
  // The block (status, resource, trigger) or action it is about.
  blockId?: string;
  detail?: Record<string, string | number | null>;
  // The rotation step that caused it ("<block uid>@<start frame>"), when
  // one did: its hits, the triggers they fired and what those made.
  cause?: string | null;
};

// The id of one play of a rotation step.
export const causeId = (entry: {
  blockUid: string;
  startTime: number;
}): string => `${entry.blockUid}@${Math.round(entry.startTime * 60)}`;

export type EventLog = {
  events: SimEvent[];
  push: (event: Omit<SimEvent, 'seq'>) => void;
};

export const createEventLog = (): EventLog => {
  const events: SimEvent[] = [];
  let seq = 0;
  return {
    events,
    push: (event) => {
      events.push({ ...event, seq });
      seq += 1;
    },
  };
};

// By frame, then by the order they were made (an action is planned before
// the events queued for its frame run, so push order alone is not enough).
export const sortEvents = (events: SimEvent[]): SimEvent[] =>
  [...events].sort((a, b) => a.frame - b.frame || a.seq - b.seq);
