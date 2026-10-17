import { ParsedValues } from '../types';

// Escape hatch for rules no block can express: a named function a kit
// references with { "hook": "<id>" }. Keep these few and small.
export type HookContext = {
  frame: number;
  values: ParsedValues;
  getResource: (id: string) => number;
  isStatusActive: (id: string, frame: number) => boolean;
};

export type ConditionHook = (context: HookContext) => boolean;
export type OperationHook = (context: HookContext) => void;

export const CONDITION_HOOKS: Record<string, ConditionHook> = {};
export const OPERATION_HOOKS: Record<string, OperationHook> = {};
