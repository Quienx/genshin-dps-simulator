import { CategoryShare } from '../_lib/damageMeter';
import { toTestIdSlug } from '../_lib/labels';

type DamageShareSegmentProps = {
  categoryShare: CategoryShare;
  colorClassName: string;
};

const DamageShareSegment = ({
  categoryShare,
  colorClassName,
}: DamageShareSegmentProps) => (
  <div
    data-testid={`damage-share-segment-${toTestIdSlug(categoryShare.category)}`}
    className={colorClassName}
    style={{ width: `${categoryShare.share}%` }}
    title={`${categoryShare.category}: ${categoryShare.share.toFixed(1)}%`}
  />
);

export default DamageShareSegment;
