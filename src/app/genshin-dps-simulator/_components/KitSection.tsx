import KitRowItem from './KitRowItem';
import SectionHeading from './SectionHeading';
import { KitRow } from '../_lib/types';

type KitSectionProps = {
  title: string;
  rows: KitRow[];
  'data-testid'?: string;
};

const KitSection = ({
  title,
  rows,
  'data-testid': testId = 'kit-section',
}: KitSectionProps) => (
  <section data-testid={testId}>
    <SectionHeading title={title} />
    <ul className='space-y-2'>
      {rows.map((row) => (
        <KitRowItem key={row.id} row={row} />
      ))}
    </ul>
  </section>
);

export default KitSection;
