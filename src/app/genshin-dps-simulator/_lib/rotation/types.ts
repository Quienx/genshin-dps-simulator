import { RotationActionKind } from './rotationSchema';

export type RotationBlock = {
  uid: string;
  action: string;
  // Normal Attack presses in a row; the combo index carries over between
  // presses, so only a Dodge, Wait or another action restarts it at N1.
  hits: number;
  repeat: number;
  seconds: number;
  // Normal Attack: end every repetition with a Dodge (dash cancel).
  dashCancel: boolean;
};

// null in SimulationValues means "automatic": the character's built-in
// priority logic picks every action.
export type RotationSetting = {
  loop: boolean;
  blocks: RotationBlock[];
};

export type RotationStep = {
  blockUid: string;
  action: string;
  kind: RotationActionKind;
  seconds: number;
  // Its block's action, when it is another one: a sequence's own id
  // (Varesa's E special plays an E).
  blockAction?: string;
};

export type RotationTraceEntry = {
  blockUid: string;
  action: string;
  kind: RotationActionKind;
  seconds: number;
  // Normal Attack: position in the combo (0 = N1); null for other actions.
  comboIndex: number | null;
  label: string;
  startTime: number;
  // When the next action could start: the end of its animation, or earlier
  // when the next action cancels it.
  endTime: number;
  waitedSeconds: number;
  warning: string | null;
  // What the action did, when worth showing (e.g. Bond of Life absorbed).
  note: string | null;
  // The action actually performed, when the step's turned into another
  // (a Normal Attack that was a bite).
  performedAction?: string;
  // Its block's action (see RotationStep).
  blockAction?: string;
  // Not performed (no Energy, a failed requirement): it takes no time;
  // `warning` says why.
  skipped?: boolean;
};
