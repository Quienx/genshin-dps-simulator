import { useMemo } from 'react';

import { Card } from '@/components/ui/card';

import SkillPassive from './SkillPassive';
import SkillPassives from './SkillPassives';
import { SkillsContext } from './skillsContext';
import SkillTalent from './SkillTalent';
import CardTitle from '../CardTitle';
import { PassiveData, TalentData } from '../../_lib/characterSchema';
import { FieldHandlers } from '../../_lib/sectionTypes';
import { parseValues } from '../../_lib/simulationValues';

type SkillsCardProps = FieldHandlers & {
  character: {
    talents: TalentData[];
    passives: PassiveData[];
  };
  'data-testid'?: string;
};

const SkillsCard = ({
  character,
  values,
  onNumberChange,
  onFlagChange,
  'data-testid': testId = 'skills-card',
}: SkillsCardProps) => {
  const contextValue = useMemo(
    () => ({
      values,
      parsedValues: parseValues(values),
      onNumberChange,
      onFlagChange,
    }),
    [values, onNumberChange, onFlagChange]
  );

  return (
    <SkillsContext.Provider value={contextValue}>
      <Card data-testid={testId} className='min-w-0 p-4'>
        <CardTitle
          title='Skills'
          subtitle='Talent multipliers the simulator uses'
        />
        {character.talents.map((talent) => (
          <SkillTalent key={talent.id} talent={talent} />
        ))}
        <SkillPassives title='Passive talents'>
          {character.passives.map((passive) => (
            <SkillPassive key={passive.id} passive={passive} />
          ))}
        </SkillPassives>
      </Card>
    </SkillsContext.Provider>
  );
};

export default SkillsCard;
