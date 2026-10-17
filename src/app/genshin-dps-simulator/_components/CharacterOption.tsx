import { SelectItem } from '@/components/ui/select';

import { CharacterDefinition } from '../_lib/types';

type CharacterOptionProps = {
  character: CharacterDefinition;
};

const CharacterOption = ({ character }: CharacterOptionProps) => (
  <SelectItem
    data-testid={`character-option-${character.id}`}
    value={character.id}
  >
    {character.name}
  </SelectItem>
);

export default CharacterOption;
