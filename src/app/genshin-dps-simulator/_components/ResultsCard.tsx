import { Card } from '@/components/ui/card';

import ResultsSection from './ResultsSection';
import { Build } from '../_lib/types';

type ResultsCardProps = {
  build: Build;
};

// Standalone results, for characters without a rotation editor.
const ResultsCard = ({ build }: ResultsCardProps) => (
  <Card data-testid='results-card' className='min-w-0 gap-0 p-3'>
    <ResultsSection build={build} />
  </Card>
);

export default ResultsCard;
