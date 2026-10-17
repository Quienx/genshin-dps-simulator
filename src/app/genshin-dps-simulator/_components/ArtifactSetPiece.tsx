import ItemIcon from './ItemIcon';
import { ItemPieceView } from '../_lib/sectionTypes';

type ArtifactSetPieceProps = {
  setName: string;
  piece: ItemPieceView;
  dimmed: boolean;
};

const ArtifactSetPiece = ({
  setName,
  piece,
  dimmed,
}: ArtifactSetPieceProps) => (
  <ItemIcon
    data-testid={`artifact-set-pieces-${piece.id}`}
    src={piece.src}
    alt={`${setName} ${piece.label}`}
    size={52}
    dimmed={dimmed}
  />
);

export default ArtifactSetPiece;
