import { Card } from '@/components/ui/card';

import BuildHighlight from '../BuildHighlight';
import CardTitle from '../CardTitle';
import CharacterAvatar from '../CharacterAvatar';
import FieldSectionBlock from '../FieldSectionBlock';
import SectionHeading from '../SectionHeading';
import { CharacterBuildView, FieldHandlers } from '../../_lib/sectionTypes';

type CharacterBuildSectionProps = FieldHandlers & {
  build: CharacterBuildView;
  'data-testid'?: string;
};

const CharacterBuildSection = ({
  build,
  values,
  onNumberChange,
  onFlagChange,
  'data-testid': testId = 'character-build-card',
}: CharacterBuildSectionProps) => (
  <Card data-testid={testId} className='min-w-0 p-4'>
    <CardTitle
      title='Character build'
      subtitle={build.name}
      media={<CharacterAvatar src={build.avatarSrc} alt={build.name} />}
    />
    <BuildHighlight highlight={build.highlight} />
    {build.screenTotals && (
      <section data-testid={`${testId}-artifact-totals`}>
        <SectionHeading title='Stats (from the artifacts)' />
        <dl className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
          {build.screenTotals.map(({ label, value }) => (
            <div key={label} className='flex justify-between gap-2'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='font-semibold tabular-nums'>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    )}
    <FieldSectionBlock
      data-testid={`${testId}-stats`}
      title={build.screenTotals ? 'Other stats' : 'Stats'}
      fields={build.statFields}
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
    <FieldSectionBlock
      data-testid={`${testId}-talents`}
      title='Talent levels'
      fields={build.talentFields}
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
  </Card>
);

export default CharacterBuildSection;
