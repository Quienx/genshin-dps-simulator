import { toTestIdSlug } from '../_lib/labels';
import { SimulationDetail } from '../_lib/types';

type ResultDetailRowProps = {
  detail: SimulationDetail;
};

const ResultDetailRow = ({ detail }: ResultDetailRowProps) => (
  <div data-testid={`result-detail-row-${toTestIdSlug(detail.label)}`}>
    {detail.label}: {detail.value}
  </div>
);

export default ResultDetailRow;
