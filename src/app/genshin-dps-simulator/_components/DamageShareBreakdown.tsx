import DamageShareLegendItem from './DamageShareLegendItem';
import DamageShareSegment from './DamageShareSegment';
import { CategoryShare, getShareSegmentClassName } from '../_lib/damageMeter';

type DamageShareBreakdownProps = {
  categoryShares: CategoryShare[];
};

const DamageShareBreakdown = ({
  categoryShares,
}: DamageShareBreakdownProps) => (
  <div
    data-testid='damage-share-breakdown'
    className='flex min-w-0 flex-col justify-center gap-2 rounded-lg border px-3 py-2'
  >
    <div className='flex h-2 overflow-hidden rounded-full bg-muted'>
      {categoryShares.map((categoryShare, rank) => (
        <DamageShareSegment
          key={categoryShare.category}
          categoryShare={categoryShare}
          colorClassName={getShareSegmentClassName(rank)}
        />
      ))}
    </div>
    <ul className='flex flex-wrap gap-x-4 gap-y-1 text-[11px]'>
      {categoryShares.map((categoryShare, rank) => (
        <DamageShareLegendItem
          key={categoryShare.category}
          categoryShare={categoryShare}
          colorClassName={getShareSegmentClassName(rank)}
        />
      ))}
    </ul>
  </div>
);

export default DamageShareBreakdown;
