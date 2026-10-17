import { ParsedValues } from './types';

export const readNumber = (values: ParsedValues, name: string): number =>
  values.numbers[name] ?? 0;

export const readFlag = (values: ParsedValues, name: string): boolean =>
  values.flags[name] ?? false;
