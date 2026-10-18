import { executeRun, RunRequest } from '../../_lib/runRequest';
import { TeamRun } from '../../_lib/team';

// Runs played in the simulation worker (simulation.worker.ts), one at a
// time in the order asked. Without workers (an old browser, tests) or if
// it fails to start, they are played here, as before.
type Pending = {
  resolve: (run: TeamRun) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

const getWorker = (): Worker | null => {
  if (worker !== undefined) {
    return worker;
  }
  try {
    worker =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./simulation.worker.ts', import.meta.url));
  } catch {
    worker = null;
  }
  worker?.addEventListener(
    'message',
    (event: MessageEvent<{ id: number; run?: TeamRun; error?: string }>) => {
      const { id, run, error } = event.data;
      const entry = pending.get(id);
      pending.delete(id);
      if (!entry) {
        return;
      }
      if (run) {
        entry.resolve(run);
      } else {
        entry.reject(new Error(error ?? 'The simulation failed'));
      }
    }
  );
  worker?.addEventListener('error', () => {
    // A worker that cannot run: these runs and the next ones go here.
    const waiting = Array.from(pending.values());
    pending.clear();
    worker?.terminate();
    worker = null;
    waiting.forEach((entry) =>
      entry.reject(new Error('The simulation worker stopped'))
    );
  });
  return worker;
};

export const runInBackground = (request: RunRequest): Promise<TeamRun> => {
  const thread = getWorker();
  if (!thread) {
    return Promise.resolve().then(() => executeRun(request));
  }
  nextId += 1;
  const id = nextId;
  return new Promise<TeamRun>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    thread.postMessage({ id, request });
  }).catch(() => executeRun(request));
};
