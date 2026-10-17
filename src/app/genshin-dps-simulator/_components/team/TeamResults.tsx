import formatNumber from '../../_lib/formatNumber';
import { TeamHighestHit, TeamMemberRun } from '../../_lib/team';

type TeamResultsProps = {
  dps: number;
  highestHit: TeamHighestHit | null;
  totalDamage: number;
  caption: string;
  members: TeamMemberRun[];
  duration: number;
};

const topCategories = (damageByCategory: Record<string, number>) =>
  Object.entries(damageByCategory)
    .sort(([, first], [, second]) => second - first)
    .slice(0, 3)
    .map(([category]) => category)
    .join(', ');

// The team's DPS and each member's part of it.
const TeamResults = ({
  dps,
  highestHit,
  totalDamage,
  caption,
  members,
  duration,
}: TeamResultsProps) => (
  <div data-testid='team-results' className='flex flex-col gap-2'>
    <p className='text-sm'>
      <span className='text-2xl font-semibold'>{formatNumber(dps)}</span>{' '}
      <span className='text-muted-foreground'>{caption}</span>
      {' · '}
      <span data-testid='team-total-damage' className='font-semibold'>
        {formatNumber(totalDamage)}
      </span>{' '}
      <span className='text-muted-foreground'>
        total DMG in {formatNumber(duration)} s
      </span>
    </p>
    {highestHit && (
      <p data-testid='team-highest-hit' className='text-sm'>
        <span className='text-muted-foreground'>Highest hit: </span>
        <span className='font-semibold tabular-nums'>
          {formatNumber(highestHit.damage)}
        </span>{' '}
        <span className='text-muted-foreground'>
          {highestHit.name} · {highestHit.source} at{' '}
          {formatNumber(highestHit.time)} s{highestHit.isCrit ? ' (CRIT)' : ''}
        </span>
      </p>
    )}
    <table className='w-full text-sm'>
      <thead>
        <tr className='text-left text-xs text-muted-foreground'>
          <th className='py-1 font-medium'>Member</th>
          <th className='py-1 text-right font-medium'>Total DMG</th>
          <th className='py-1 text-right font-medium'>DPS</th>
          <th className='py-1 text-right font-medium'>Share</th>
          <th className='py-1 text-right font-medium'>Highest hit</th>
          <th className='py-1 text-right font-medium'>On field</th>
          <th className='hidden py-1 pl-4 font-medium sm:table-cell'>
            Most damage from
          </th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr
            key={member.characterId}
            data-testid={`team-results-${member.characterId}`}
            className='border-t'
          >
            <td className='py-1 font-medium'>{member.name}</td>
            <td className='py-1 text-right tabular-nums'>
              {formatNumber(member.damage)}
            </td>
            <td className='py-1 text-right tabular-nums'>
              {formatNumber(member.dps)}
            </td>
            <td className='py-1 text-right tabular-nums'>
              {formatNumber(member.share * 100)}%
            </td>
            <td
              className='py-1 text-right tabular-nums'
              title={
                member.highestHit
                  ? `${member.highestHit.source} at ${formatNumber(
                      member.highestHit.time
                    )} s${member.highestHit.isCrit ? ' (CRIT)' : ''}`
                  : undefined
              }
            >
              {member.highestHit ? formatNumber(member.highestHit.damage) : '—'}
            </td>
            <td className='py-1 text-right tabular-nums'>
              {formatNumber(member.fieldTime)} / {formatNumber(duration)} s
            </td>
            <td className='hidden py-1 pl-4 text-muted-foreground sm:table-cell'>
              {topCategories(member.damageByCategory)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TeamResults;
