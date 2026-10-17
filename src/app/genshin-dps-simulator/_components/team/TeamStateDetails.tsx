import SkillCooldownIcon from './SkillCooldownIcon';
import { getTeamSnapshot, TeamRun } from '../../_lib/team';

type TeamStateDetailsProps = {
  run: TeamRun;
  // Seconds into the run.
  time: number;
};

// Each member's state just before a piece of the team rotation, like the
// game's HUD: its E and Q icons with their cooldowns and the Q's Energy,
// and what is up. Only built while the tooltip is open.
const TeamStateDetails = ({ run, time }: TeamStateDetailsProps) => {
  const members = getTeamSnapshot(run, time);
  return (
    <div data-testid='team-state-details' className='shrink-0 text-left'>
      <p className='mb-1.5 font-semibold'>Team</p>
      <div className='flex flex-col gap-2'>
        {members.map((member) => (
          <div
            key={member.characterId}
            data-testid={`team-state-${member.characterId}`}
            className='flex items-center gap-2'
          >
            <SkillCooldownIcon
              icon={member.skillIcon}
              label={`${member.name} E`}
              cooldown={member.skill}
              element={member.element}
            />
            <SkillCooldownIcon
              icon={member.burstIcon}
              label={`${member.name} Q`}
              cooldown={member.burst}
              element={member.element}
              energy={member.energy}
            />
            <div className='min-w-0'>
              <p className='flex items-center gap-1 font-medium'>
                {member.onField && (
                  <span
                    title='On the field'
                    className='size-2 shrink-0 rounded-full bg-emerald-500'
                  />
                )}
                {member.name}
                {member.energy && (
                  <span
                    data-testid={`team-state-energy-${member.characterId}`}
                    title='Energy / what the Q costs'
                    className='text-[10px] font-normal tabular-nums opacity-80'
                  >
                    ⚡ {Math.floor(member.energy.value)}/{member.energy.max}
                  </span>
                )}
                {member.points && (
                  <span
                    title='Nightsoul points'
                    className='text-[10px] font-normal tabular-nums opacity-70'
                  >
                    ☾ {Math.floor(member.points.value)}
                  </span>
                )}
              </p>
              {member.statuses.length > 0 && (
                <p
                  title={member.statuses.join(', ')}
                  className='max-w-56 truncate text-[10px] opacity-60'
                >
                  {member.statuses.join(' · ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamStateDetails;
