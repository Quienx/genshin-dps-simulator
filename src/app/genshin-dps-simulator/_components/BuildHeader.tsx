import { Button } from '@/components/ui/button';

import CharacterSelect from './CharacterSelect';
import { CharacterId } from '../_lib/types';

type BuildHeaderProps = {
  buildId: number;
  character: CharacterId;
  onCharacterChange: (characterId: string) => void;
  onRemove: () => void;
};

const BuildHeader = ({
  buildId,
  character,
  onCharacterChange,
  onRemove,
}: BuildHeaderProps) => (
  <div
    data-testid='build-header'
    className='flex flex-wrap items-end justify-between gap-4 border-b pb-3'
  >
    <div className='flex flex-wrap items-end gap-4'>
      <h2 data-testid='build-header-title' className='text-xl font-semibold'>
        Build {buildId}
      </h2>
      <div className='w-56'>
        <CharacterSelect value={character} onValueChange={onCharacterChange} />
      </div>
    </div>
    <Button
      data-testid='build-header-remove'
      variant='destructive'
      size='sm'
      onClick={onRemove}
    >
      Remove
    </Button>
  </div>
);

export default BuildHeader;
