import { z } from 'zod';

import { EventQueue } from '../queue';
import { Block } from '../schema';

// Verdant Dew (Nod-Krai's Lunar-Bloom): the party's, up to 3. After a
// Lunar-Bloom the party gathers it for a while (gcsim's verdantDewTick):
// every frame of the window adds 1 to a partial count, and 146 make a
// Dew; a new Lunar-Bloom extends the window. Moonridge Dew (Columbina's A4)
// is a second pool that kits spend after it. Both are shared resources: a
// kit spends them with `addResource` (Verdant first: spend Moonridge only
// `if` Verdant is 0, then Verdant).
const paramsSchema = z.object({}).strict();

export const VERDANT_DEW_ID = 'verdantDew';
export const MOONRIDGE_DEW_ID = 'moonridgeDew';
const MAX_DEW = 3;
// gcsim: the window lasts 149 frames from the reaction; 146 frames of it
// make a Dew.
const WINDOW_FRAMES = 149;
const FRAMES_PER_DEW = 146;

export const expandVerdantDew = (params: unknown): Block[] => {
  paramsSchema.parse(params ?? {});
  return [
    {
      id: VERDANT_DEW_ID,
      type: 'resource',
      source: 'system',
      label: 'Verdant Dew',
      icon: 'UI_Buff_Element_Grass',
      min: 0,
      max: MAX_DEW,
      initial: 0,
      shared: true,
    },
    {
      id: MOONRIDGE_DEW_ID,
      type: 'resource',
      source: 'system',
      label: 'Moonridge Dew',
      icon: 'UI_Buff_Element_Grass',
      min: 0,
      max: MAX_DEW,
      initial: 0,
      shared: true,
    },
  ];
};

// The party's Dew gathering. `onLunarBloom` opens (or extends) the window;
// `gain` adds one Dew (the party's resource) at a frame.
export const createVerdantDewClock = ({
  queue,
  getDew,
  gain,
}: {
  queue: EventQueue;
  getDew: () => number;
  gain: (frame: number) => void;
}) => {
  let partial = 0;
  let windowEnd = -1;
  let ticking = false;
  const tick = (frame: number) => {
    if (frame > windowEnd) {
      ticking = false;
      return;
    }
    if (getDew() < MAX_DEW) {
      partial += 1;
      if (partial >= FRAMES_PER_DEW) {
        partial = 0;
        gain(frame);
      }
    }
    queue.push(frame + 1, tick);
  };
  return {
    onLunarBloom: (frame: number) => {
      // gcsim sets the new end a frame later; the frames in between still
      // count under the old one.
      queue.push(frame + 1, () => {
        windowEnd = frame + WINDOW_FRAMES;
        if (!ticking) {
          ticking = true;
          queue.push(frame + 1, tick);
        }
      });
    },
  };
};
