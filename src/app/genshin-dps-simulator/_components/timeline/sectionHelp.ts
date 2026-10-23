// What each section of the inspector shows and how to use it, for its "?"
// tooltip. One place for every text, so they stay consistent. In any line,
// `backticks` mark a key, a gesture or a term (shown as a chip).
export type SectionHelpText = {
  title: string;
  // What the section is, in a sentence or two.
  summary: string;
  // What you see in it.
  shows?: string[];
  // What you can do with it.
  use?: string[];
  // Something worth knowing (an approximation, a limit).
  note?: string;
};

// Edit mode's keys, the same line in the timeline's help and the edit bar's.
const EDIT_KEYS =
  'In edit mode: `Ctrl` / `Cmd` + `C` copies the picked blocks, `Ctrl` + `X` cuts them, `Ctrl` + `V` pastes them where the pointer is; `Ctrl` + `A` picks every block, `Delete` removes the picked ones, `Esc` unpicks them.';

export const SECTION_HELP = {
  // ------------------------------------------------------------ page cards
  timeline: {
    title: 'Timeline',
    summary:
      'The whole run on one time axis, like a video editor: what every member did, and everything that was up or happened because of it.',
    shows: [
      '`Character Actions`: each member’s blocks, as they were performed.',
      '`Buffs & Debuffs`: every bonus, debuff and state while it was up.',
      '`Coordinated Attacks`: hits that statuses and triggers make on their own.',
      '`Energy & Particles` and `Healing & Other Events`.',
      'The playhead (blue line): every other panel shows the run at that moment.',
    ],
    use: [
      'Its bar plays the run: go to the start, the previous event, play, the next event, the end; the speed, the clock, a slider that drags the playhead through the run like a video’s, `Zoom` and `Fit`.',
      'Drag the tracks to pan; `Shift` + wheel or a sideways swipe also pans.',
      '`Ctrl` / `Alt` + wheel zooms around the pointer; `Fit` shows the whole run.',
      'Click or drag the ruler to move the playhead. Anywhere on the page (not while typing): `Space` plays, `←` `→` step a frame (`Shift`: a second), `Home` / `End` go to either end, `+` / `-` zoom.',
      'Hover a block or a bar for its details; click a group’s name to fold it; drag the names column’s edge to widen it.',
      'Colors: everything in the color of its member: their blocks (lightest for the Normal Attack, darkest for the Burst) and the effects they give.',
      '`Edit rotation` turns the blocks into a rotation you can change (see the edit bar’s `?`).',
      EDIT_KEYS,
      'The team menu picks a team, a saved one or one character; its `Build a team…` picks the members: the team becomes the one `In edition` in the menu (kept as you edit), which `Save as team` keeps in `My teams`.',
      '`Share` copies a short link or code with the team, its builds and its rotation.',
    ],
    note: 'Hits after the counted duration (60 s) are drawn dimmed: they are played but not counted.',
  },
  damage: {
    title: 'Results',
    summary:
      'The whole run’s result, in the top bar: its DPS and DMG over the counted duration, wherever the playhead is.',
    shows: [
      'DPS: the run’s DMG ÷ the counted duration (60 s by default).',
      'With `Average` CRIT: how the total moved against the last run of this team (an edited rotation or build).',
      '`Breakdown` (its bar: each member’s share) opens each member’s share, then DPS and share by member or by kind of hit (talents, coordinated attacks, reactions).',
      'At its bottom: the DMG dealt up to the playhead, and its share of the run’s.',
    ],
    use: [
      '`CRIT`, next to it: `Average` deals each hit’s average CRIT, so a rotation always gives the same total and two can be compared; `Rolled` makes each hit crit or not, and `Roll again` rolls them anew.',
    ],
    note: 'Only the counted duration adds up: hits after it are drawn but add nothing.',
  },
  enemy: {
    title: 'Enemy',
    summary: 'The training dummy every hit lands on, at the playhead.',
    shows: [
      'Its level and HP bar. When its HP reaches 0 it comes back at full HP; `Defeated ×n` counts how many times.',
      'The element aura on it now (with the units left): what the next hit of another element reacts with.',
      'The last reaction it took.',
      '`Defeats & Reactions`: how many times its HP ran out, and the reactions so far (by kind, with their DMG).',
      'RES and DEF debuffs on it: in `Active Effects` and each hit’s `Damage Breakdown`.',
    ],
    note: 'Auras and reactions are only simulated in team runs (Overloaded, Melt, Vaporize, and Bloom, which a Nod-Krai member turns into Lunar-Bloom).',
  },
  event: {
    title: 'Selected Event',
    summary:
      'Everything about one moment of the run: the action at the playhead, the block you picked, or an event you pinned.',
    shows: [
      'Who did it and how they were then: their E and Q, special system and weapon, and their stats (ATK, CRIT, DMG Bonus) with what changed from their screen totals.',
      '`Hit Details`, then the `Damage Breakdown` and `Bonuses on this hit` of the hit you pick.',
      '`Active Effects`: everything that was up then, by lane.',
    ],
    use: [
      'Move the playhead (or click a block) to change what it shows.',
      'The pin keeps the current event while you move the playhead.',
      'The arrows in a card’s corner focus on that card (the others hide).',
    ],
    note: 'The enemy and its aura are in the `Enemy` panel.',
  },
  combatLog: {
    title: 'Combat Log',
    summary: 'What happened up to the playhead, as a list, newest on top.',
    shows: [
      'Each action with its hits so far, each reaction and each heal, with times and DMG.',
    ],
    use: [
      'The filters (`All`, `Damage`, `Healing`, `Buffs`, `Debuffs`, `Other`) keep only those rows.',
      'Click a row to move the playhead there; the arrow jumps to the next event the filters keep.',
    ],
  },
  editBar: {
    title: 'Editing the rotation',
    summary:
      'The rotation as blocks you can add, move, change and remove. The run is simulated again after every change, and kept in this browser.',
    use: [
      'Drag a member’s action onto the chart to add it where it drops; a click adds it at the end.',
      '`Dash` and `Wait` (General) belong to the member of the row they are dropped on; a block of a member off the field swaps them in first (there are no Swap blocks).',
      'Click a block to change it here: a Normal Attack’s hits, a Wait’s seconds, an E’s `Hold`.',
      'A held Charged Attack (Mavuika’s spin): its time is when the Final lands (from 0.75 s); `Prev` / `Next charge` move it a spin; it never holds past the Flamestrider’s end.',
      '`Final hit` off: the block right after (a Dash, an E, a Q, another member) cancels the spin at the release, from 0.1 s. `CDC`: the spin after a Dash cancels that Dash, 6 frames in.',
      '`Ctrl` / `Cmd` + click adds a block to the selection, `Shift` + click picks a range, `Shift` + drag on empty space draws a selection rectangle.',
      'Drag a picked block to move every picked block together.',
      EDIT_KEYS,
      'Drop blocks on the trash (or click it) to remove them; `Reset rotation` goes back to the scenario’s.',
    ],
    note: 'A block that cannot be done when it comes (no Energy, a rule) is skipped and shows a warning.',
  },

  // -------------------------------------------------------- timeline groups
  characterActions: {
    title: 'Character Actions',
    summary:
      'One row per member: each action of the rotation, from where it starts to where the next one can begin (its cancel).',
    shows: [
      'The block’s color is the member’s, in a shade by kind (Normal, Charged, E, Q…); the icon is the action or the form it took (a Flamestrider Normal, a Fiery E). An icon too wide for its block is left out.',
      'A block that played more than one form is split in stretches, each with its icon: Blade Roller kicks, then plain Normal Attacks once the Blessing ended.',
      'A faded, striped stretch is a spin going on past its state (Flamestrider): those hits would not happen in the game.',
      'A gold line inside a block is where its closing hit lands (the Final of Mavuika’s spin).',
      'A grey stretch before a block is time waited for its cooldown or its Energy.',
      'A dashed amber block was skipped (it could not be done then); a ⚠ marks a warning.',
    ],
    use: [
      'Hover a block for its hits, DMG, cost and warnings.',
      'In edit mode, drag blocks to move them and click them to change them.',
    ],
  },
  buffs: {
    title: 'Buffs & Debuffs',
    summary:
      'Every effect while it was up, one bar per effect, under the member who gave it and in their color.',
    shows: [
      'Bonuses (ATK, DMG, CRIT…) and debuffs on the enemy (RES, DEF).',
      'States and modes (Nightsoul’s Blessing, the Flamestrider, a Q’s field) and their stacks.',
      'The special systems over time: Nightsoul points, Bond of Life, Fighting Spirit.',
    ],
    use: ['Hover a bar for what it gives, who gave it and how long it lasted.'],
  },
  coordinated: {
    title: 'Coordinated Attacks',
    summary:
      'Hits that a status or a trigger makes on its own, not as part of an action: they go on while the member does something else, or is off the field.',
    shows: [
      'One row per source (Escoffier’s Mek, Citlali’s Itzpapa, Mavuika’s Ring, Nicole’s projections…).',
      'A bar for the time it was up, and a dot per hit.',
    ],
    use: ['Hover a dot for that hit’s DMG and element.'],
  },
  energy: {
    title: 'Energy & Particles',
    summary:
      'Where each member’s Energy comes from, and when their Q is affordable.',
    shows: [
      'Particles: who made them, their element and when they are caught (the member on the field gets more).',
      'Each member’s Energy over the run, against their Q’s cost.',
    ],
    note: 'Random particles (Favonius, 2 or 3 particles) are averaged with `Average` CRIT and rolled with `Rolled` (`Roll again` rolls them anew).',
  },
  other: {
    title: 'Healing & Other Events',
    summary: 'Moments that matter but deal no DMG of their own.',
    shows: [
      'Heals: who healed whom and from what.',
      'Other events, such as Nightsoul Bursts.',
    ],
    note: 'HP is not simulated: heals are logged, and they still fire the effects that react to healing.',
  },

  // ---------------------------------------------------- Selected Event cards
  character: {
    title: 'Character',
    summary: 'The member who used the action, as they were at that moment.',
    shows: [
      'Who used it, their constellations, when, and the action with its elements.',
      'The E and the Q as the game’s buttons: cooldown left (and charges), and what fills the Q against its cost.',
      'Their special system when the kit has one: Nightsoul points (Natlan), Bond of Life as % of Max HP (Arlecchino) or the party’s Verdant Dew (Nefer, Columbina).',
      'Their weapon’s stacks when it counts some, with the time they have left.',
      'The stats of the hit shown (ATK, CRIT, DMG Bonus), with what they gain over the character screen.',
    ],
    note: 'The buttons, the system and the weapon follow the playhead (a pinned event too); the stats are the hit’s. The kit’s other resources are in `Active Effects` and the timeline’s `Buffs & Debuffs`.',
  },
  hits: {
    title: 'Hit Details',
    summary: 'Every hit of the selected action.',
    shows: [
      'When it lands, its element and category, the reaction it triggered, whether it was a CRIT, and its DMG.',
    ],
    use: [
      'Click a hit to see its `Damage Breakdown` and `Bonuses on this hit`.',
      'Click the title to fold the list.',
    ],
  },
  formula: {
    title: 'Damage Breakdown',
    summary: 'How the selected hit’s DMG was computed, step by step.',
    shows: [
      'Base DMG: the talent multiplier × the stat it scales with, plus flat DMG.',
      '× (1 + DMG Bonus) × the CRIT factor (expected: 1 + CRIT Rate × CRIT DMG).',
      '× the enemy’s DEF and RES multipliers, × the amplifying reaction (Melt, Vaporize).',
    ],
    use: ['Click to open it; it stays open.'],
  },
  bonuses: {
    title: 'Bonuses on this hit',
    summary: 'Every bonus that applied to the selected hit.',
    shows: [
      'What it is, who gave it (the member, weapon, set or passive) and how much it added.',
    ],
    use: ['Click to open it; it stays open.'],
  },
  activeEffects: {
    title: 'Active Effects',
    summary: 'Everything up at that moment, grouped in lanes.',
    shows: [
      '`Special mechanics`, `Buffs & debuffs`, `Coordinated attacks`, `Mechanics` and `Resources` (each lane has its own `?`).',
      'Each effect with who gave it and the time it has left.',
    ],
    use: ['Click the title to fold the lanes.'],
  },

  // -------------------------------------------------- Active Effects lanes
  laneSpecial: {
    title: 'Special mechanics',
    summary:
      'The special systems (Nightsoul, Bond of Life) and the effects that change them.',
    shows: [
      'Nightsoul’s Blessing and the modes inside it (the Flamestrider, Opal Fire).',
      'Effects that spend or give their points.',
      'Effects that stop their points from being spent (Mavuika’s Q), with the points frozen.',
    ],
  },
  laneBuffs: {
    title: 'Buffs & debuffs',
    summary: 'Bonuses and debuffs up now: they change the DMG of the hits.',
    shows: ['What each one gives, who gave it and the time left.'],
  },
  laneCoordinated: {
    title: 'Coordinated attacks',
    summary: 'Effects that hit on their own.',
    shows: ['Their hits so far, their DMG so far and when the next one lands.'],
  },
  laneMechanics: {
    title: 'Mechanics',
    summary: 'Cooldowns and states that change what the kit can do.',
    shows: [
      'Forms’ conditions, recast locks, internal cooldowns, with the time they have left.',
    ],
  },
  laneResources: {
    title: 'Resources',
    summary: 'Energy and heals.',
    shows: ['Particles on their way and caught, and heals.'],
  },

  // -------------------------------------------------------- character sheet
  screenStats: {
    title: 'Character screen stats',
    summary:
      'The totals the game’s character screen shows: weapon, artifacts and always-on bonuses included.',
    use: [
      'Type the totals from your character screen, or turn on `Artifacts` and enter the five pieces to compute them.',
    ],
    note: 'Conditional buffs (a Q, a set’s 4-piece, a teammate) are not typed here: the kit adds them during the run, so nothing counts twice.',
  },
  talents: {
    title: 'Talents',
    summary: 'The Normal Attack, E and Q levels.',
    note: 'Enter the level before constellations: C3 and C5 add 3 to the talent they boost (the game shows the boosted one).',
  },
  runOptions: {
    title: 'Run options',
    summary: 'How this member starts the run.',
    shows: [
      '`Starting Energy`: the Energy at the start, from 0 to the Q’s cost. Lower it to see whether the rotation still gets its Q in time.',
      '`Starting Fighting Spirit` (Mavuika): her Q runs on it instead of Energy; it needs 100.',
      'The Q’s icon fills its ring with that value, as in the game: full (and glowing) when the Q can be used.',
    ],
    use: [
      'Change it and press `Save & simulate`: the run starts again with it.',
    ],
    note: 'What the rotation does (whether to use the Q…) is the timeline’s: edit its blocks. The Natlan party members are counted from the team.',
  },
  constellations: {
    title: 'Constellations',
    summary: 'How many constellations are unlocked.',
    shows: [
      'Each one, with whether it is simulated, partly simulated or not (and why).',
    ],
    use: [
      'Pick Cn to unlock C1 to Cn; pick the highest one again to lower it.',
    ],
  },
  weapon: {
    title: 'Weapon',
    summary: 'The weapon, its refinement and its passive.',
    use: [
      'Pick another weapon of the same type: the stat totals move by what each one adds (base ATK, substat, on-screen passive).',
      'Change the refinement: an on-screen passive that grows with it moves the totals too.',
    ],
    note: 'ATK keeps the build’s ATK%, read from the total assuming the plume’s 311 flat ATK.',
  },
  artifacts: {
    title: 'Artifacts',
    summary: 'The artifact set and its bonuses.',
    use: [
      'Pick another set; turn each bonus on or off with a click.',
      'Enter the five pieces (main stat and substats) to compute the screen stats from them.',
    ],
  },
} satisfies Record<string, SectionHelpText>;

export type SectionHelpKey = keyof typeof SECTION_HELP;
