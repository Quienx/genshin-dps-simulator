import { useMemo } from 'react';

import { TalentContext, useSkills } from './skillsContext';
import SkillTalentRow from './SkillTalentRow';
import SkillSection from '../SkillSection';
import TalentIcon from '../TalentIcon';
import TalentLevelControl from '../TalentLevelControl';
import { TalentData } from '../../_lib/characterSchema';
import { iconUrl } from '../../_lib/genshinIcons';
import {
  getBaseTalentLevel,
  getEffectiveTalentLevel,
  getTalentTestId,
  getTalentTitle,
  MAX_BASE_TALENT_LEVEL,
  toLevelSource,
} from '../../_lib/talents';

type SkillTalentProps = {
  talent: TalentData;
};

const getBoostSource = (boostedBy: string | null): string | undefined => {
  if (!boostedBy) {
    return undefined;
  }
  return boostedBy.toUpperCase();
};

const SkillTalent = ({ talent }: SkillTalentProps) => {
  const { parsedValues, onNumberChange } = useSkills();
  const source = toLevelSource(talent);
  const level = getEffectiveTalentLevel(parsedValues, source);
  const contextValue = useMemo(() => ({ level }), [level]);
  const testId = `skills-card-${getTalentTestId(talent)}`;

  const handleLevelChange = (nextLevel: string) => {
    onNumberChange(talent.levelField, nextLevel);
  };

  return (
    <TalentContext.Provider value={contextValue}>
      <SkillSection
        data-testid={testId}
        title={getTalentTitle(talent)}
        icon={
          <TalentIcon
            data-testid={`${testId}-icon`}
            src={iconUrl(talent.icon)}
            alt={talent.name}
          />
        }
        detail={
          <TalentLevelControl
            data-testid={`${testId}-level`}
            baseLevel={getBaseTalentLevel(parsedValues, source)}
            effectiveLevel={level}
            maxLevel={MAX_BASE_TALENT_LEVEL}
            label={`${talent.name} level`}
            boostSource={getBoostSource(talent.boostedBy)}
            note={talent.statusNote}
            onLevelChange={handleLevelChange}
          />
        }
      >
        <ul data-testid={`${testId}-rows`} className='mt-3 space-y-2'>
          {talent.rows.map((row) => (
            <SkillTalentRow key={row.id} row={row} />
          ))}
        </ul>
      </SkillSection>
    </TalentContext.Provider>
  );
};

export default SkillTalent;
