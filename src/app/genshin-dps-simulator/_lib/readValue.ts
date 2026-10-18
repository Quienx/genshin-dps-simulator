import { ParsedValues } from './types';

export const readNumber = (values: ParsedValues, name: string): number =>
  values.numbers[name] ?? 0;

export const readFlag = (values: ParsedValues, name: string): boolean =>
  values.flags[name] ?? false;

// A number, or one of two by a flag (`{ flag, then, else }`).
export const readFlagNumber = (
  values: ParsedValues,
  value: number | { flag: string; then: number; else: number }
): number =>
  typeof value === 'number'
    ? value
    : readFlag(values, value.flag)
    ? value.then
    : value.else;
