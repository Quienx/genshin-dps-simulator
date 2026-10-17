import { KitRuntime } from './runtime';
import { DetailData } from './schema';
import formatNumber from '../formatNumber';
import { FRAMES_PER_SECOND } from '../frames';
import { SimulationDetail } from '../types';

// Detail values are templates over the run's counters:
//   {uses:skill} {hits} {hits:Normal} {hits:Normal:Pyro} {count:x}
//   {bonusHits:<id>} {bonusStacks:<id>} {cooldownCut:skill} {resource:<id>}
//   {buffValue:<team buff id>} {uptime:<status id>} (frames)
// "a/b" divides two of them (by at least 1); "|number", "|fixed1",
// "|seconds" (frames → s) and "|percent" (frames → % of the run) format
// the result, plain integers otherwise.
const readValue = (
  runtime: KitRuntime,
  key: string,
  durationFrames: number
): number => {
  if (key.startsWith('resource:')) {
    return runtime.getResource(key.slice('resource:'.length));
  }
  if (key.startsWith('buffValue:')) {
    return runtime.getBuffValue(key.slice('buffValue:'.length));
  }
  if (key.startsWith('uptime:')) {
    return runtime.getUptime(key.slice('uptime:'.length), durationFrames);
  }
  return runtime.getCounter(key);
};

const formatValue = (
  value: number,
  format: string | undefined,
  durationFrames: number
): string => {
  switch (format) {
    case 'number':
      return formatNumber(value);
    case 'fixed1':
      return value.toFixed(1);
    case 'seconds':
      return formatNumber(value / FRAMES_PER_SECOND);
    case 'percent':
      return `${((value / durationFrames) * 100).toFixed(1)}%`;
    default:
      return String(value);
  }
};

const resolveToken = (
  runtime: KitRuntime,
  token: string,
  durationFrames: number
): string => {
  const [expression, format] = token.split('|');
  const [numerator, denominator] = expression.split('/');
  const read = (key: string) => readValue(runtime, key, durationFrames);
  const value =
    denominator === undefined
      ? read(numerator)
      : read(numerator) / Math.max(1, read(denominator));
  return formatValue(value, format, durationFrames);
};

export const renderDetails = (
  details: DetailData[],
  runtime: KitRuntime,
  durationFrames: number
): SimulationDetail[] =>
  details.map((detail) => ({
    label: detail.label,
    value: detail.value.replace(/\{([^}]+)\}/g, (_, token: string) =>
      resolveToken(runtime, token, durationFrames)
    ),
  }));
