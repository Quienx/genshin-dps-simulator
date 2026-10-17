// Each party member's own color, from their element: a member alone in
// their element gets that element's color; members who share one get its
// next shades (four Pyro: orange, red, amber, rose), so every member's
// line reads apart at a glance.
import { RotationActionKind } from '../../_lib/rotation/rotationSchema';

type MemberShade = {
  // The Tailwind color the shade is drawn from, for its kind fills.
  family: ShadeFamily;
  // An action's rectangle: border, fill and text.
  chip: string;
  // A bar or a stripe.
  bar: string;
  // The member's name.
  text: string;
};

export type MemberColor = Omit<MemberShade, 'family'> & {
  // An action's rectangle by kind, lightest for the Normal Attack and
  // darkest for the Burst, so a member's actions read apart; other kinds
  // keep `chip`.
  kinds: Partial<Record<RotationActionKind, string>>;
};

const KIND_FILLS = {
  orange: [
    'bg-orange-200/60',
    'bg-orange-400',
    'bg-orange-600',
    'bg-orange-800',
  ],
  red: ['bg-red-200/60', 'bg-red-400', 'bg-red-600', 'bg-red-800'],
  amber: ['bg-amber-200/60', 'bg-amber-400', 'bg-amber-600', 'bg-amber-800'],
  rose: ['bg-rose-200/60', 'bg-rose-400', 'bg-rose-600', 'bg-rose-800'],
  violet: [
    'bg-violet-200/60',
    'bg-violet-400',
    'bg-violet-600',
    'bg-violet-800',
  ],
  fuchsia: [
    'bg-fuchsia-200/60',
    'bg-fuchsia-400',
    'bg-fuchsia-600',
    'bg-fuchsia-800',
  ],
  purple: [
    'bg-purple-200/60',
    'bg-purple-400',
    'bg-purple-600',
    'bg-purple-800',
  ],
  indigo: [
    'bg-indigo-200/60',
    'bg-indigo-400',
    'bg-indigo-600',
    'bg-indigo-800',
  ],
  sky: ['bg-sky-200/60', 'bg-sky-400', 'bg-sky-600', 'bg-sky-800'],
  blue: ['bg-blue-200/60', 'bg-blue-400', 'bg-blue-600', 'bg-blue-800'],
  cyan: ['bg-cyan-200/60', 'bg-cyan-400', 'bg-cyan-600', 'bg-cyan-800'],
  teal: ['bg-teal-200/60', 'bg-teal-400', 'bg-teal-600', 'bg-teal-800'],
  lime: ['bg-lime-200/60', 'bg-lime-400', 'bg-lime-600', 'bg-lime-800'],
  green: ['bg-green-200/60', 'bg-green-400', 'bg-green-600', 'bg-green-800'],
  emerald: [
    'bg-emerald-200/60',
    'bg-emerald-400',
    'bg-emerald-600',
    'bg-emerald-800',
  ],
  yellow: [
    'bg-yellow-200/60',
    'bg-yellow-400',
    'bg-yellow-600',
    'bg-yellow-800',
  ],
  slate: ['bg-slate-200/60', 'bg-slate-400', 'bg-slate-600', 'bg-slate-800'],
} as const;

type ShadeFamily = keyof typeof KIND_FILLS;

// Lightest to darkest, the order of KIND_FILLS.
const SHADED_KINDS = ['normal', 'charged', 'skill', 'burst'] as const;

const withKinds = ({ family, ...shade }: MemberShade): MemberColor => ({
  ...shade,
  kinds: Object.fromEntries(
    SHADED_KINDS.map((kind, index) => [
      kind,
      `border-white/20 text-white ${KIND_FILLS[family][index]}`,
    ])
  ),
});

// Every class written out in full, so Tailwind keeps them.
const ELEMENT_COLORS: Record<string, MemberShade[]> = {
  Pyro: [
    {
      chip: 'border-orange-400/60 bg-orange-500/25 text-orange-100',
      family: 'orange',
      bar: 'bg-orange-500',
      text: 'text-orange-300',
    },
    {
      chip: 'border-red-400/60 bg-red-500/25 text-red-100',
      family: 'red',
      bar: 'bg-red-500',
      text: 'text-red-300',
    },
    {
      chip: 'border-amber-400/60 bg-amber-500/25 text-amber-100',
      family: 'amber',
      bar: 'bg-amber-500',
      text: 'text-amber-300',
    },
    {
      chip: 'border-rose-400/60 bg-rose-500/25 text-rose-100',
      family: 'rose',
      bar: 'bg-rose-500',
      text: 'text-rose-300',
    },
  ],
  Electro: [
    {
      chip: 'border-violet-400/60 bg-violet-500/25 text-violet-100',
      family: 'violet',
      bar: 'bg-violet-500',
      text: 'text-violet-300',
    },
    {
      chip: 'border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-100',
      family: 'fuchsia',
      bar: 'bg-fuchsia-500',
      text: 'text-fuchsia-300',
    },
    {
      chip: 'border-purple-400/60 bg-purple-500/25 text-purple-100',
      family: 'purple',
      bar: 'bg-purple-500',
      text: 'text-purple-300',
    },
    {
      chip: 'border-indigo-400/60 bg-indigo-500/25 text-indigo-100',
      family: 'indigo',
      bar: 'bg-indigo-500',
      text: 'text-indigo-300',
    },
  ],
  Hydro: [
    {
      chip: 'border-sky-400/60 bg-sky-500/25 text-sky-100',
      family: 'sky',
      bar: 'bg-sky-500',
      text: 'text-sky-300',
    },
    {
      chip: 'border-blue-400/60 bg-blue-500/25 text-blue-100',
      family: 'blue',
      bar: 'bg-blue-500',
      text: 'text-blue-300',
    },
    {
      chip: 'border-cyan-400/60 bg-cyan-500/25 text-cyan-100',
      family: 'cyan',
      bar: 'bg-cyan-500',
      text: 'text-cyan-300',
    },
    {
      chip: 'border-indigo-300/60 bg-indigo-400/25 text-indigo-100',
      family: 'indigo',
      bar: 'bg-indigo-400',
      text: 'text-indigo-200',
    },
  ],
  Cryo: [
    {
      chip: 'border-cyan-200/60 bg-cyan-300/25 text-cyan-50',
      family: 'cyan',
      bar: 'bg-cyan-300',
      text: 'text-cyan-200',
    },
    {
      chip: 'border-sky-200/60 bg-sky-300/25 text-sky-50',
      family: 'sky',
      bar: 'bg-sky-300',
      text: 'text-sky-200',
    },
    {
      chip: 'border-teal-200/60 bg-teal-300/25 text-teal-50',
      family: 'teal',
      bar: 'bg-teal-300',
      text: 'text-teal-200',
    },
    {
      chip: 'border-blue-200/60 bg-blue-300/25 text-blue-50',
      family: 'blue',
      bar: 'bg-blue-300',
      text: 'text-blue-200',
    },
  ],
  Dendro: [
    {
      chip: 'border-lime-400/60 bg-lime-500/25 text-lime-100',
      family: 'lime',
      bar: 'bg-lime-500',
      text: 'text-lime-300',
    },
    {
      chip: 'border-green-400/60 bg-green-500/25 text-green-100',
      family: 'green',
      bar: 'bg-green-500',
      text: 'text-green-300',
    },
    {
      chip: 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100',
      family: 'emerald',
      bar: 'bg-emerald-500',
      text: 'text-emerald-300',
    },
    {
      chip: 'border-yellow-300/60 bg-yellow-400/25 text-yellow-100',
      family: 'yellow',
      bar: 'bg-yellow-400',
      text: 'text-yellow-200',
    },
  ],
  Anemo: [
    {
      chip: 'border-teal-300/60 bg-teal-400/25 text-teal-100',
      family: 'teal',
      bar: 'bg-teal-400',
      text: 'text-teal-200',
    },
    {
      chip: 'border-emerald-300/60 bg-emerald-400/25 text-emerald-100',
      family: 'emerald',
      bar: 'bg-emerald-400',
      text: 'text-emerald-200',
    },
    {
      chip: 'border-green-200/60 bg-green-300/25 text-green-50',
      family: 'green',
      bar: 'bg-green-300',
      text: 'text-green-200',
    },
    {
      chip: 'border-cyan-300/60 bg-cyan-400/25 text-cyan-100',
      family: 'cyan',
      bar: 'bg-cyan-400',
      text: 'text-cyan-200',
    },
  ],
  Geo: [
    {
      chip: 'border-yellow-400/60 bg-yellow-500/25 text-yellow-100',
      family: 'yellow',
      bar: 'bg-yellow-500',
      text: 'text-yellow-300',
    },
    {
      chip: 'border-amber-300/60 bg-amber-400/25 text-amber-100',
      family: 'amber',
      bar: 'bg-amber-400',
      text: 'text-amber-200',
    },
    {
      chip: 'border-orange-200/60 bg-orange-300/25 text-orange-50',
      family: 'orange',
      bar: 'bg-orange-300',
      text: 'text-orange-200',
    },
    {
      chip: 'border-yellow-200/60 bg-yellow-300/25 text-yellow-50',
      family: 'yellow',
      bar: 'bg-yellow-300',
      text: 'text-yellow-200',
    },
  ],
};

const FALLBACK: MemberShade = {
  chip: 'border-slate-400/60 bg-slate-500/25 text-slate-100',
  family: 'slate',
  bar: 'bg-slate-400',
  text: 'text-slate-200',
};

// The party's colors, in party order: the first member of an element gets
// its color, the next ones its next shades.
export const buildMemberColors = (
  members: { characterId: string; element: string }[]
): Map<string, MemberColor> => {
  const used = new Map<string, number>();
  return new Map(
    members.map((member) => {
      const shades = ELEMENT_COLORS[member.element];
      const index = used.get(member.element) ?? 0;
      used.set(member.element, index + 1);
      return [
        member.characterId,
        withKinds(shades ? shades[index % shades.length] : FALLBACK),
      ];
    })
  );
};
