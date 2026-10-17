import { useId } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import CharacterOption from './CharacterOption';
import { CHARACTER_LIST } from '../_lib/characters';
import { CharacterId } from '../_lib/types';

type CharacterSelectProps = {
  value: CharacterId;
  onValueChange: (value: string) => void;
};

const CharacterSelect = ({ value, onValueChange }: CharacterSelectProps) => {
  const triggerId = useId();

  return (
    <div data-testid='character-select' className='space-y-1.5'>
      <Label htmlFor={triggerId}>Character</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={triggerId} data-testid='character-select-trigger'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHARACTER_LIST.map((character) => (
            <CharacterOption key={character.id} character={character} />
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default CharacterSelect;
