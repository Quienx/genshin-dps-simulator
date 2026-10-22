// The UI reads its colors and small text sizes from the design tokens
// (src/styles/globals.css) and uses the shared components: raw chrome
// classes, pixel font sizes and the browser's own dialogs do not come back.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../..');
const ROOTS = [
  join(SRC, 'app/genshin-dps-simulator/_components'),
  join(SRC, 'components/ui'),
  join(SRC, 'app/error.tsx'),
  join(SRC, 'app/not-found.tsx'),
  join(SRC, 'app/layout.tsx'),
];

// Data colors, not chrome: each member's palette and each source's.
const DATA_FILES = new Set(['memberColors.ts', 'sourceStyles.tsx']);

const filesUnder = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => name !== 'node_modules')
        .flatMap((name) => filesUnder(join(path, name)))
    : /\.tsx?$/.test(path)
    ? [path]
    : [];

const FILES = ROOTS.flatMap(filesUnder);

// Every line breaking a rule, as `file:line: text`.
const offending = (
  rule: RegExp,
  { skipDataFiles = false }: { skipDataFiles?: boolean } = {}
) =>
  FILES.flatMap((file) => {
    if (skipDataFiles && DATA_FILES.has(file.split('/').pop() ?? '')) {
      return [];
    }
    return readFileSync(file, 'utf8')
      .split('\n')
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(({ text }) => rule.test(text))
      .map(
        ({ text, line }) => `${relative(SRC, file)}:${line}: ${text.trim()}`
      );
  });

describe('design tokens', () => {
  it('finds the UI files', () => {
    expect(FILES.length).toBeGreaterThan(40);
  });

  it('sizes small text with text-2xs / text-3xs, not pixels', () => {
    expect(offending(/\btext-\[\d+(\.\d+)?px\]/)).toEqual([]);
  });

  it('takes colors from the tokens, not hex values in classes', () => {
    expect(offending(/-\[#[0-9a-fA-F]{3,8}\]/)).toEqual([]);
  });

  it('draws surfaces, lines and text with tokens, not slate shades', () => {
    // What the tokens replaced: text 50–500 (foreground, muted-foreground,
    // subtle), surfaces 700–950 (accent, muted, card, panel, sunken) and
    // lines 600–800 (input, border). Other slate shades are data colors.
    const chrome =
      /(?<![\w-])(?:text-slate-(?:50|[1-5]00)|bg-slate-(?:[6-9]00|950)|(?:border|divide|ring)(?:-[trblxy])?-slate-(?:[6-8]00|950))(?![\w-])/;
    expect(offending(chrome, { skipDataFiles: true })).toEqual([]);
  });

  it('uses the brand scale for the accent; sky stays an element color', () => {
    // Hydro is sky blue: its entries in the element maps keep it.
    const sky = /(?<![\w-])[a-z-]+-sky-\d{2,3}/;
    expect(
      offending(sky, { skipDataFiles: true }).filter(
        (entry) => !/:\s*Hydro:/.test(entry)
      )
    ).toEqual([]);
  });

  it('asks and tells in the app’s own dialogs', () => {
    expect(offending(/\bwindow\.(alert|confirm|prompt)\(/)).toEqual([]);
  });
});
