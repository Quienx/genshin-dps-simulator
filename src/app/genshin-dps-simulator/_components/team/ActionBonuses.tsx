import { getLoadedCharacter } from '../../_lib/characterData';
import formatNumber from '../../_lib/formatNumber';
import { iconUrl } from '../../_lib/genshinIcons';
import { getActionBonuses, TeamRun } from '../../_lib/team';

type ActionBonusesProps = {
  run: TeamRun;
  blockUid: string;
};

const SOURCE_LABELS: Record<string, string> = {
  talent: 'Talent',
  passive: 'Passive',
  constellation: 'Const.',
  weapon: 'Weapon',
  artifact: 'Set',
  system: 'System',
  resonance: 'Resonance',
};

// Resonances have no icon: a dot of their element's color.
const ELEMENT_COLORS: Record<string, string> = {
  Pyro: '#ff9b52',
  Electro: '#b380ff',
  Hydro: '#4cc2f1',
  Cryo: '#9fe0e8',
  Anemo: '#71e3c0',
  Geo: '#f0c34f',
  Dendro: '#a5c83b',
};

const avatarOf = (run: TeamRun, name: string): string | null => {
  const member = run.members.find((entry) => entry.name === name);
  return member
    ? iconUrl(getLoadedCharacter(member.characterId).character.icons.avatar)
    : null;
};

// The bonuses this action's hits got, each with its icon, its value and
// where it comes from (the hitter's own, or a teammate's). Only built while
// the tooltip is open.
const ActionBonuses = ({ run, blockUid }: ActionBonusesProps) => {
  const bonuses = getActionBonuses(run, blockUid);
  if (bonuses.length === 0) {
    return null;
  }
  return (
    <div data-testid='action-bonuses' className='min-w-0 text-left'>
      <p className='mb-1 font-semibold'>Bonuses</p>
      <ul className='grid grid-cols-[repeat(3,minmax(9rem,1fr))] gap-x-3 gap-y-1'>
        {bonuses.map((bonus) => {
          const src = bonus.iconUrl ?? avatarOf(run, bonus.from);
          return (
            <li
              key={bonus.id}
              title={`${bonus.from} · ${
                SOURCE_LABELS[bonus.source] ?? bonus.source
              }: ${bonus.label} · ${
                bonus.remaining === null
                  ? 'permanent'
                  : `${formatNumber(bonus.remaining)} s left`
              }${
                bonus.hits < bonus.totalHits
                  ? ` (${bonus.hits}/${bonus.totalHits} hits)`
                  : ''
              }`}
              className='flex min-w-0 items-center gap-1.5'
            >
              {/* Its time left over the icon, like a skill's; ∞ when
                  nothing times it. */}
              <span className='relative size-7 shrink-0 overflow-hidden rounded-full bg-black/40'>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt=''
                    width={28}
                    height={28}
                    className='size-full object-cover opacity-80'
                  />
                ) : (
                  <span
                    aria-hidden
                    className='block size-full'
                    style={{
                      background: ELEMENT_COLORS[bonus.element ?? ''] ?? '#888',
                    }}
                  />
                )}
                <span className='absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_black]'>
                  {bonus.remaining === null
                    ? '∞'
                    : formatNumber(Math.ceil(bonus.remaining * 10) / 10)}
                </span>
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[11px] font-semibold tabular-nums'>
                  {bonus.value}
                </span>
                <span className='block truncate text-[10px] opacity-60'>
                  {SOURCE_LABELS[bonus.source] ?? bonus.source} · {bonus.from}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ActionBonuses;
