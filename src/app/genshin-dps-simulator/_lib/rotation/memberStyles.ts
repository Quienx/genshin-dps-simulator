// A team's colors, one per party slot: every block of a member (palette
// and timeline) wears its slot's color, so members are told apart at a
// glance. The action kind stays as a thin stripe (KIND_STYLES' bar).
type MemberStyle = {
  chip: string;
  bar: string;
  // The member's name in the palette.
  text: string;
};

// What a team block shows of its member: its color and face.
export type BlockMember = {
  chip: string;
  avatar?: string;
  name: string;
};

export const MEMBER_STYLES: MemberStyle[] = [
  {
    chip: 'border-yellow-500/50 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
    bar: 'bg-yellow-500',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  {
    chip: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
  },
  {
    chip: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    chip: 'border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
  },
];

export const getMemberStyle = (slot: number): MemberStyle =>
  MEMBER_STYLES[
    ((slot % MEMBER_STYLES.length) + MEMBER_STYLES.length) %
      MEMBER_STYLES.length
  ];
