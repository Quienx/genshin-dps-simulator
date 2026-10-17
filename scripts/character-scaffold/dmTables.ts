// Reads gcsim's generated zz_<name>.dm.go: every talent table with the
// label its comment gives ("// skill: LowTemperatureCooking - Skill DMG:
// {0}"), one value per talent level. Nested tables (the Normal Attack's,
// one per hit) come out one by one.
export type DmTable = {
  // The variable name, or "attack-<n>" for the nested Normal Attack ones.
  id: string;
  talent: 'attack' | 'skill' | 'burst';
  label: string;
  values: number[];
  // Large values (a heal's flat part): not a % multiplier.
  flat: boolean;
};

const COMMENT = /\/\/\s*(attack|skill|burst):\s*[^-]*-\s*([^:{]+)/;
const ASSIGN = /^\s*(\w+)\s*=\s*\[\]/;
const NUMBER = /^\s*(-?\d+(?:\.\d+)?),\s*$/;

export const parseDmTables = (source: string): DmTable[] => {
  const tables: DmTable[] = [];
  let pending: { talent: DmTable['talent']; label: string } | null = null;
  let current: DmTable | null = null;
  let variable: string | null = null;
  let nested = 0;

  const close = () => {
    if (current && current.values.length > 0) {
      current.flat = current.values.every((value) => value >= 20);
      tables.push(current);
    }
    current = null;
  };

  source.split('\n').forEach((line) => {
    const comment = line.match(COMMENT);
    const assign = line.match(ASSIGN);
    if (assign) {
      close();
      variable = assign[1];
      nested = 0;
    }
    if (comment) {
      pending = {
        talent: comment[1] as DmTable['talent'],
        label: comment[2].trim(),
      };
      // A comment inside a nested table starts its next hit.
      if (line.includes('{') && variable) {
        close();
        nested += 1;
        current = {
          id: `${variable}-${nested}`,
          talent: pending.talent,
          label: pending.label,
          values: [],
          flat: false,
        };
        return;
      }
    }
    if (assign && pending && !line.includes('[][]')) {
      current = {
        id: variable ?? 'table',
        talent: pending.talent,
        label: pending.label,
        values: [],
        flat: false,
      };
      return;
    }
    const number = line.match(NUMBER);
    if (number && current) {
      current.values.push(Number(number[1]));
    }
  });
  close();
  return tables;
};
