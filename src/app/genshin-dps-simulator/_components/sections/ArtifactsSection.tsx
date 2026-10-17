import { Card } from '@/components/ui/card';

import ArtifactEditor from '../artifacts/ArtifactEditor';
import ArtifactSetPieces from '../ArtifactSetPieces';
import CardTitle from '../CardTitle';
import FieldGrid from '../FieldGrid';
import KitRowList from '../KitRowList';
import { CharacterData } from '../../_lib/characterSchema';
import { ArtifactSetView, FieldHandlers } from '../../_lib/sectionTypes';

type ArtifactsSectionProps = FieldHandlers & {
  artifactSet: ArtifactSetView;
  character: CharacterData;
  'data-testid'?: string;
};

const ArtifactsSection = ({
  artifactSet,
  character,
  values,
  onNumberChange,
  onFlagChange,
  onArtifactsChange,
  'data-testid': testId = 'artifacts-card',
}: ArtifactsSectionProps) => (
  <Card data-testid={testId} className='min-w-0 p-4'>
    <CardTitle title='Artifacts' subtitle={artifactSet.subtitle} />
    <FieldGrid
      fields={artifactSet.fields}
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
    <ArtifactSetPieces
      name={artifactSet.name}
      pieces={artifactSet.pieces}
      isActive={artifactSet.isActive}
    />
    <KitRowList data-testid='artifact-set-rows' rows={artifactSet.rows} />
    {onArtifactsChange && (
      <ArtifactEditor
        character={character}
        values={values}
        onArtifactsChange={onArtifactsChange}
      />
    )}
  </Card>
);

export default ArtifactsSection;
