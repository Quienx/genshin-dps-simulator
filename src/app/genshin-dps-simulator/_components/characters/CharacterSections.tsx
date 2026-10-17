import ConstellationsCard from '../constellations/ConstellationsCard';
import SectionColumn from '../SectionColumn';
import ArtifactsSection from '../sections/ArtifactsSection';
import CharacterBuildSection from '../sections/CharacterBuildSection';
import SkillsCard from '../skills/SkillsCard';
import WeaponCard from '../weapons/WeaponCard';
import { getCharacterData } from '../../_lib/characterData';
import {
  getArtifactSetView,
  getCharacterBuildView,
} from '../../_lib/characterSections';
import { FieldHandlers } from '../../_lib/sectionTypes';

// Build, gear and skills of any character, straight from its file.
const CharacterSections = ({
  values,
  onNumberChange,
  onFlagChange,
  onArtifactsChange,
}: FieldHandlers) => {
  const character = getCharacterData(values.character);
  const handlers = { values, onNumberChange, onFlagChange };

  return (
    <div
      data-testid={`${character.id}-sections`}
      className='grid items-start gap-4 lg:grid-cols-3'
    >
      <SectionColumn data-testid='build-column'>
        <CharacterBuildSection
          build={getCharacterBuildView(character, values)}
          {...handlers}
        />
        <ConstellationsCard
          character={character}
          values={values}
          onFlagChange={onFlagChange}
        />
      </SectionColumn>
      <SectionColumn data-testid='gear-column'>
        <WeaponCard weapon={character.weapon} {...handlers} />
        <ArtifactsSection
          artifactSet={getArtifactSetView(character, values)}
          character={character}
          onArtifactsChange={onArtifactsChange}
          {...handlers}
        />
      </SectionColumn>
      <SkillsCard character={character} {...handlers} />
    </div>
  );
};

export default CharacterSections;
