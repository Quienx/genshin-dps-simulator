import {
  isLunarCategory,
  TRANSFORMATIVE_REACTIONS,
} from '../../_lib/reactions';

// Each element's text color (an aura, a hit's element): the same in every
// panel.
export const ELEMENT_TEXT: Record<string, string> = {
  Pyro: 'text-orange-400',
  Electro: 'text-violet-400',
  Hydro: 'text-sky-400',
  Cryo: 'text-cyan-300',
  Dendro: 'text-lime-400',
  Anemo: 'text-teal-300',
  Geo: 'text-yellow-400',
  Physical: 'text-slate-300',
};

// Each kind of hit in the Results breakdown, in a hue of its own: the
// talents, coordinated attacks, reactions' own hits and Lunar DMG.
const DAMAGE_TYPE_BARS: Record<string, string> = {
  Normal: 'bg-blue-500',
  Charged: 'bg-yellow-400',
  Plunge: 'bg-red-500',
  Skill: 'bg-orange-500',
  Burst: 'bg-violet-500',
  coordinated: 'bg-teal-400',
};

export const damageTypeBar = (key: string): string =>
  DAMAGE_TYPE_BARS[key] ??
  (isLunarCategory(key)
    ? 'bg-lime-400'
    : TRANSFORMATIVE_REACTIONS.includes(key)
    ? 'bg-rose-300'
    : 'bg-slate-600');
