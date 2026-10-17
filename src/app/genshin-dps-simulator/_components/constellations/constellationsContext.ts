import { createContext, useContext } from 'react';

import { ConstellationGains } from '../../_lib/constellationGains';
import { SimulationValues } from '../../_lib/types';

export type ConstellationsContextValue = {
  values: SimulationValues;
  gains: ConstellationGains;
  onFlagChange: (name: string, checked: boolean) => void;
};

export const ConstellationsContext =
  createContext<ConstellationsContextValue | null>(null);

export const useConstellations = (): ConstellationsContextValue => {
  const context = useContext(ConstellationsContext);
  if (!context) {
    throw new Error(
      'useConstellations must be used inside <ConstellationsCard>'
    );
  }
  return context;
};
