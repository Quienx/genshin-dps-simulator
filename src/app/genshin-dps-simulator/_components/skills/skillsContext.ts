import { createContext, useContext } from 'react';

import { ParsedValues, SimulationValues } from '../../_lib/types';

export type SkillsContextValue = {
  values: SimulationValues;
  parsedValues: ParsedValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

export type TalentContextValue = {
  level: number;
};

export const SkillsContext = createContext<SkillsContextValue | null>(null);
export const TalentContext = createContext<TalentContextValue | null>(null);

export const useSkills = (): SkillsContextValue => {
  const context = useContext(SkillsContext);
  if (!context) {
    throw new Error('useSkills must be used inside <SkillsCard>');
  }
  return context;
};

export const useTalent = (): TalentContextValue => {
  const context = useContext(TalentContext);
  if (!context) {
    throw new Error('useTalent must be used inside <SkillTalent>');
  }
  return context;
};
