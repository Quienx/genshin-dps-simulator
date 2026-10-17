import { cn } from '@/lib/utils';

import formatNumber from '../../_lib/formatNumber';
import { iconUrl } from '../../_lib/genshinIcons';
import { CooldownState } from '../../_lib/team';

// Energy ring colors, by element (as the game's Burst icon).
const ELEMENT_COLORS: Record<string, string> = {
  Pyro: '#ff9b52',
  Hydro: '#4cc2f1',
  Electro: '#b380ff',
  Cryo: '#9fe0e8',
  Anemo: '#71e3c0',
  Geo: '#f0c34f',
  Dendro: '#a5c83b',
};

type SkillCooldownIconProps = {
  icon: string | null;
  label: string;
  cooldown: CooldownState;
  element: string;
  // The Q: Energy fills a ring around the icon.
  energy?: { value: number; max: number } | null;
  size?: number;
};

// An E or Q icon like the game's: a dark sweep and the seconds left while
// it recharges; for the Q, a ring that fills with Energy and glows when the
// Q can be used.
const SkillCooldownIcon = ({
  icon,
  label,
  cooldown,
  element,
  energy,
  size = 40,
}: SkillCooldownIconProps) => {
  const color = ELEMENT_COLORS[element] ?? '#ffffff';
  const onCooldown = cooldown.remaining > 0;
  // A charge recharging while another is ready: shown, but usable.
  const recharging = cooldown.recharging > 0;
  const sweep =
    recharging && cooldown.max > 0
      ? Math.min(1, cooldown.recharging / cooldown.max)
      : 0;
  const energyShare = energy
    ? Math.min(1, energy.value / Math.max(1, energy.max))
    : 1;
  const usable = !onCooldown && energyShare >= 1;
  const ring = 3;

  return (
    <div
      data-testid={`skill-icon-${label}`}
      title={`${label}: ${
        onCooldown
          ? `${formatNumber(cooldown.remaining)} s`
          : recharging
          ? `ready (${cooldown.ready}/${
              cooldown.charges
            }), next charge in ${formatNumber(cooldown.recharging)} s`
          : 'ready'
      }${
        energy
          ? ` · Energy ${formatNumber(energy.value)}/${formatNumber(
              energy.max
            )}`
          : ''
      }`}
      className='relative shrink-0 rounded-full'
      style={{
        width: size,
        height: size,
        padding: energy ? ring : 0,
        // The Energy ring: filled clockwise from the top.
        background: energy
          ? `conic-gradient(${color} ${
              energyShare * 360
            }deg, rgb(255 255 255 / 0.15) 0)`
          : undefined,
        boxShadow: usable && energy ? `0 0 8px ${color}` : undefined,
      }}
    >
      <div className='relative size-full overflow-hidden rounded-full bg-black/60'>
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl(icon)}
            alt=''
            className={cn(
              'size-full object-cover',
              !usable && energy && !onCooldown && 'opacity-60'
            )}
          />
        )}
        {recharging && (
          <>
            {/* The part still recharging, swept counter-clockwise; light
                while another charge is ready. */}
            <span
              aria-hidden
              className='absolute inset-0'
              style={{
                background: onCooldown
                  ? `conic-gradient(rgb(0 0 0 / 0.65) ${
                      sweep * 360
                    }deg, rgb(0 0 0 / 0.35) 0)`
                  : `conic-gradient(rgb(0 0 0 / 0.45) ${
                      sweep * 360
                    }deg, transparent 0)`,
              }}
            />
            <span className='absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_black]'>
              {formatNumber(Math.ceil(cooldown.recharging * 10) / 10)}
            </span>
          </>
        )}
      </div>
      {/* Energy still missing: shown on the icon, as in the game. */}
      {energy && energyShare < 1 && !onCooldown && (
        <span className='absolute inset-x-0 bottom-0.5 text-center text-[10px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_black]'>
          {Math.floor(energy.value)}
        </span>
      )}
      {energy && energyShare < 1 && onCooldown && (
        <span className='absolute inset-x-0 -bottom-1 text-center text-[9px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_black]'>
          {Math.floor(energy.value)}
        </span>
      )}
      {cooldown.charges > 1 && (
        <span className='absolute -right-1 -bottom-1 rounded-full bg-black/80 px-1 text-[9px] font-bold text-white tabular-nums'>
          {cooldown.ready}
        </span>
      )}
    </div>
  );
};

export default SkillCooldownIcon;
