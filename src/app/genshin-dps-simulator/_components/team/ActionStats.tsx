import {
  Crosshair,
  Heart,
  LucideIcon,
  Shield,
  Sparkles,
  Sword,
  TrendingUp,
} from 'lucide-react';

import formatNumber from '../../_lib/formatNumber';
import { getActionStats, TeamRun } from '../../_lib/team';

type ActionStatsProps = {
  run: TeamRun;
  blockUid: string;
};

const SCALING_ICONS: Record<string, LucideIcon> = {
  ATK: Sword,
  HP: Heart,
  DEF: Shield,
};

const percent = (fraction: number) => `${formatNumber(fraction * 100)}%`;

const Stat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className='flex items-center gap-1.5'>
    <Icon aria-hidden className='size-3.5 shrink-0 opacity-70' />
    <span className='opacity-70'>{label}</span>
    <span className='ml-auto font-semibold tabular-nums'>{value}</span>
  </div>
);

// The hitter's stats at the action's first hit, every buff included, in two
// columns: its scaling stat (ATK…), CRIT Rate, CRIT DMG and DMG Bonus.
const ActionStats = ({ run, blockUid }: ActionStatsProps) => {
  const stats = getActionStats(run, blockUid);
  if (!stats) {
    return null;
  }
  return (
    <div data-testid='action-stats' className='mt-1.5 text-left'>
      <p className='mb-1 font-semibold'>{stats.name}</p>
      <div className='grid grid-cols-2 gap-x-4 gap-y-0.5'>
        <Stat
          icon={SCALING_ICONS[stats.statLabel] ?? Sword}
          label={stats.statLabel}
          value={formatNumber(Math.round(stats.stat))}
        />
        <Stat
          icon={Crosshair}
          label='CRIT Rate'
          value={percent(stats.critRate)}
        />
        <Stat
          icon={Sparkles}
          label='CRIT DMG'
          value={percent(stats.critDamage)}
        />
        <Stat
          icon={TrendingUp}
          label='DMG Bonus'
          value={`+${formatNumber(stats.dmgBonus)}%`}
        />
      </div>
    </div>
  );
};

export default ActionStats;
