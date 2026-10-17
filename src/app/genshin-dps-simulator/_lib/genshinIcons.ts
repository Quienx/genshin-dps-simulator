// Icons are served by Project Amber (gi.yatta.moe); artifact icons live in
// its "reliquary" subfolder. Character files store only the asset names.
const PROJECT_AMBER_UI_ASSETS = 'https://gi.yatta.moe/assets/UI';

export const iconUrl = (name: string): string =>
  `${PROJECT_AMBER_UI_ASSETS}/${name}.png`;

export const relicIconUrl = (name: string): string =>
  `${PROJECT_AMBER_UI_ASSETS}/reliquary/${name}.png`;

export const monsterIconUrl = (name: string): string =>
  `${PROJECT_AMBER_UI_ASSETS}/monster/${name}.png`;

// The game's element icons (the ones shown over an enemy with an aura).
const ELEMENT_ICON_NAMES: Record<string, string> = {
  Pyro: 'UI_Buff_Element_Fire',
  Hydro: 'UI_Buff_Element_Water',
  Electro: 'UI_Buff_Element_Electric',
  Cryo: 'UI_Buff_Element_Ice',
  Dendro: 'UI_Buff_Element_Grass',
  Anemo: 'UI_Buff_Element_Wind',
  Geo: 'UI_Buff_Element_Rock',
};

export const elementIconUrl = (element: string): string | null =>
  ELEMENT_ICON_NAMES[element] ? iconUrl(ELEMENT_ICON_NAMES[element]) : null;
