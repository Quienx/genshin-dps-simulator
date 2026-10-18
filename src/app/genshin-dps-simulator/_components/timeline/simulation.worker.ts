// The simulation's own thread: it plays the runs the page asks for, so a
// long one never blocks the page (dragging, scrolling, the playhead).
import { executeRun, RunRequest } from '../../_lib/runRequest';

type Message = { id: number; request: RunRequest };

self.onmessage = (event: MessageEvent<Message>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, run: executeRun(request) });
  } catch (failure) {
    self.postMessage({
      id,
      error: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
