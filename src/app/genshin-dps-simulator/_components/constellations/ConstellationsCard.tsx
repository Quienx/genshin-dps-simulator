import { useMemo } from 'react';

import { Card } from '@/components/ui/card';

import Constellation from './Constellation';
import { ConstellationsContext } from './constellationsContext';
import CardTitle from '../CardTitle';
import ConstellationGainSummary from '../ConstellationGainSummary';
import { ConstellationData } from '../../_lib/characterSchema';
import { getConstellationGains } from '../../_lib/constellationGains';
import { SimulationValues } from '../../_lib/types';

type ConstellationsCardProps = {
  character: {
    constellations: ConstellationData[];
  };
  values: SimulationValues;
  onFlagChange: (name: string, checked: boolean) => void;
  'data-testid'?: string;
};

const countActive = (
  constellations: ConstellationData[],
  values: SimulationValues
): number =>
  constellations.filter((constellation) => values.flags[constellation.id])
    .length;

const ConstellationsCard = ({
  character,
  values,
  onFlagChange,
  'data-testid': testId = 'constellations-card',
}: ConstellationsCardProps) => {
  const { constellations } = character;
  const gains = useMemo(
    () => getConstellationGains(values, constellations),
    [values, constellations]
  );
  const contextValue = useMemo(
    () => ({ values, gains, onFlagChange }),
    [values, gains, onFlagChange]
  );

  return (
    <ConstellationsContext.Provider value={contextValue}>
      <Card data-testid={testId} className='min-w-0 p-4'>
        <CardTitle
          title='Constellations'
          subtitle={`${countActive(constellations, values)} of ${
            constellations.length
          } active`}
        />
        <ConstellationGainSummary total={gains.total} />
        <ul data-testid='constellation-list' className='space-y-3'>
          {constellations.map((constellation) => (
            <Constellation
              key={constellation.id}
              constellation={constellation}
            />
          ))}
        </ul>
      </Card>
    </ConstellationsContext.Provider>
  );
};

export default ConstellationsCard;
