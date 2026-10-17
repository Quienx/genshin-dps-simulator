import ArtifactSetPiece from './ArtifactSetPiece';
import { ItemPieceView } from '../_lib/sectionTypes';

type ArtifactSetPiecesProps = {
  name: string;
  pieces: ItemPieceView[];
  isActive: boolean;
};

const ArtifactSetPieces = ({
  name,
  pieces,
  isActive,
}: ArtifactSetPiecesProps) => {
  if (pieces.length === 0) {
    return null;
  }

  return (
    <div data-testid='artifact-set-pieces' className='mt-4'>
      <div className='mb-2 text-sm font-semibold'>{name}</div>
      <div className='flex flex-wrap gap-2'>
        {pieces.map((piece) => (
          <ArtifactSetPiece
            key={piece.id}
            setName={name}
            piece={piece}
            dimmed={!isActive}
          />
        ))}
      </div>
    </div>
  );
};

export default ArtifactSetPieces;
