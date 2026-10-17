import FieldGrid from './FieldGrid';
import SectionHeading from './SectionHeading';
import { FieldDefinition, SimulationValues } from '../_lib/types';

type FieldSectionBlockProps = {
  title: string;
  fields: FieldDefinition[];
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
  'data-testid'?: string;
};

const FieldSectionBlock = ({
  title,
  fields,
  values,
  onNumberChange,
  onFlagChange,
  'data-testid': testId = 'field-section-block',
}: FieldSectionBlockProps) => {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section data-testid={testId}>
      <SectionHeading title={title} />
      <FieldGrid
        fields={fields}
        values={values}
        onNumberChange={onNumberChange}
        onFlagChange={onFlagChange}
      />
    </section>
  );
};

export default FieldSectionBlock;
