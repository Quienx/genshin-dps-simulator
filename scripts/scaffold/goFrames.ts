// Reads a gcsim character .go file for what a character file's timings
// need: hitmark arrays and constants, frame slices (an action's end and its
// cancels), cooldowns, Energy, charges, every AttackInfo (element, gauge,
// ICD) and particles. Values are resolved where gcsim writes them as
// constants or small expressions (15*60, attackHitmarks[2][2]); what it
// cannot resolve is kept as written.
export type FramesReport = {
  arrays: Record<string, number[] | number[][]>;
  constants: Record<string, number>;
  // By slice ("attackFrames[0]", "skillFrames"): the frame any next action
  // may start (`end`), its first hitmark when gcsim gives it, and cancels
  // by the character file's keys (normal, charged, skill, burst, dodge…).
  frames: Record<
    string,
    {
      end: number | string;
      hitmark?: number | string;
      cancels: Record<string, number | string>;
    }
  >;
  cooldowns: {
    action: string;
    frames: number | string;
    delay?: number | string;
  }[];
  energy: { max?: number; consumedAt: (number | string)[] };
  charges: { action: string; count: number | string }[];
  attacks: {
    abil: string;
    attackTag?: string;
    icdTag?: string;
    icdGroup?: string;
    element?: string;
    gauge?: number | string;
    mult?: string;
  }[];
  particles: { count: number | string; element: string; delay: string }[];
};

// gcsim's actions → the cancel keys of a character file.
const ACTION_KEYS: Record<string, string> = {
  Attack: 'normal',
  Charge: 'charged',
  Skill: 'skill',
  Burst: 'burst',
  Dash: 'dodge',
  Swap: 'swap',
  Jump: 'jump',
  Walk: 'walk',
  LowPlunge: 'plunge',
  HighPlunge: 'plunge',
};

// A small arithmetic expression over numbers, constants and array cells.
const evaluate = (
  raw: string,
  constants: Record<string, number>,
  arrays: FramesReport['arrays']
): number | string => {
  const tokens = raw.match(/\d+(?:\.\d+)?|\w+(?:\[\d+\])*|[()*/+-]/g) ?? [];
  let at = 0;
  const value = (): number => {
    const token = tokens[at++];
    if (token === '(') {
      const inner = sum();
      at += 1; // ')'
      return inner;
    }
    if (token === '-') {
      return -value();
    }
    if (token !== undefined && /^\d/.test(token)) {
      return Number(token);
    }
    const cell = token?.match(/^(\w+)((?:\[\d+\])*)$/);
    if (cell) {
      const indexes = Array.from(cell[2].matchAll(/\[(\d+)\]/g)).map((m) =>
        Number(m[1])
      );
      let found: unknown = indexes.length
        ? arrays[cell[1]]
        : constants[cell[1]];
      indexes.forEach((index) => {
        found = Array.isArray(found) ? found[index] : undefined;
      });
      if (typeof found === 'number') {
        return found;
      }
    }
    throw new Error(`cannot resolve "${token}"`);
  };
  const product = (): number => {
    let result = value();
    while (tokens[at] === '*' || tokens[at] === '/') {
      const op = tokens[at++];
      const next = value();
      result = op === '*' ? result * next : result / next;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++];
      const next = product();
      result = op === '+' ? result + next : result - next;
    }
    return result;
  };
  try {
    const result = sum();
    return at === tokens.length ? result : raw.trim();
  } catch {
    return raw.trim();
  }
};

const parseIntArrays = (body: string): number[] | number[][] => {
  const inner = Array.from(body.matchAll(/\{([^{}]*)\}/g));
  const numbers = (text: string) =>
    (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return inner.length > 0
    ? inner.map((match) => numbers(match[1]))
    : numbers(body);
};

const field = (body: string, name: string) =>
  body.match(new RegExp(`\\b${name}:\\s*([^,\\n]+)`))?.[1].trim();

export const parseGoFrames = (sources: string[]): FramesReport => {
  const source = sources.join('\n');
  // Every match of a pattern in the sources.
  const all = (pattern: RegExp) => Array.from(source.matchAll(pattern));
  const report: FramesReport = {
    arrays: {},
    constants: {},
    frames: {},
    cooldowns: [],
    energy: { consumedAt: [] },
    charges: [],
    attacks: [],
    particles: [],
  };

  // Arrays first: constants and frames may read them.
  for (const match of all(
    /(\w+)\s*=\s*\[\](?:\[\])?int\{((?:[^{}]|\{[^{}]*\})*)\}/g
  )) {
    report.arrays[match[1]] = parseIntArrays(match[2]);
  }
  // Constants (in const blocks and `name = value` lines), resolved in
  // order so later ones can read earlier ones.
  for (const match of all(
    /^\s*(?:const\s+)?(\w+)\s*=\s*([-\d(][\w\s.*/+()[\]-]*?)\s*(?:\/\/.*)?$/gm
  )) {
    const resolved = evaluate(match[2], report.constants, report.arrays);
    if (typeof resolved === 'number') {
      report.constants[match[1]] = resolved;
    }
  }
  const resolve = (raw: string) =>
    evaluate(raw, report.constants, report.arrays);

  for (const match of all(
    /(\w+(?:\[\w+\])?)\s*=\s*frames\.Init(AbilSlice|NormalCancelSlice)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g
  )) {
    const parts = match[3].split(',');
    report.frames[match[1]] =
      match[2] === 'NormalCancelSlice'
        ? {
            hitmark: resolve(parts[0]),
            end: resolve(parts[1] ?? ''),
            cancels: {},
          }
        : { end: resolve(parts[0]), cancels: {} };
  }
  for (const match of all(
    /(\w+(?:\[\w+\])?)\[action\.Action(\w+)\]\s*=\s*([^\n/]+)/g
  )) {
    const slice = report.frames[match[1]];
    const key = ACTION_KEYS[match[2]];
    if (slice && key) {
      slice.cancels[key] = resolve(match[3]);
    }
  }

  for (const match of all(
    /SetCD(WithDelay)?\(action\.Action(\w+),\s*([^,)]+)(?:,\s*([^)]+))?\)/g
  )) {
    report.cooldowns.push({
      action: ACTION_KEYS[match[2]] ?? match[2],
      frames: resolve(match[3]),
      ...(match[4] ? { delay: resolve(match[4]) } : {}),
    });
  }
  const energyMax = source.match(/EnergyMax\s*=\s*(\d+)/);
  if (energyMax) {
    report.energy.max = Number(energyMax[1]);
  }
  for (const match of all(/ConsumeEnergy\(([^)]+)\)/g)) {
    report.energy.consumedAt.push(resolve(match[1]));
  }
  for (const match of all(/SetNumCharges\(action\.Action(\w+),\s*([^)]+)\)/g)) {
    report.charges.push({
      action: ACTION_KEYS[match[1]] ?? match[1],
      count: resolve(match[2]),
    });
  }

  for (const match of all(/info\.AttackInfo\{([\s\S]*?)\n\s*\}/g)) {
    const body = match[1];
    const durability = field(body, 'Durability');
    const icdGroup = field(body, 'ICDGroup')?.replace(/^attacks\.ICDGroup/, '');
    report.attacks.push({
      abil: field(body, 'Abil')?.replace(/^"|"$/g, '') ?? '?',
      attackTag: field(body, 'AttackTag')?.replace(/^attacks\.AttackTag/, ''),
      icdTag: field(body, 'ICDTag')?.replace(/^attacks\.ICDTag/, ''),
      // gcsim's Default group is the files' "standard".
      icdGroup: icdGroup
        ? icdGroup === 'Default'
          ? 'standard'
          : icdGroup.charAt(0).toLowerCase() + icdGroup.slice(1)
        : undefined,
      element: field(body, 'Element')?.replace(/^attributes\./, ''),
      gauge:
        durability === undefined
          ? undefined
          : ((value) => (typeof value === 'number' ? value / 25 : value))(
              resolve(durability)
            ),
      mult: field(body, 'Mult'),
    });
  }
  for (const match of all(
    /QueueParticle\([^,]+,\s*([^,]+),\s*attributes\.(\w+),\s*([^)]+)\)/g
  )) {
    report.particles.push({
      count: resolve(match[1]),
      element: match[2],
      delay: match[3].trim(),
    });
  }
  return report;
};
