import { Metadata } from 'next';

import CombatTimelinePage from '../_components/timeline/CombatTimelinePage';

export const metadata: Metadata = {
  title: 'Genshin Impact Simulation Inspector',
};

export default function GenshinTimelinePage() {
  return <CombatTimelinePage />;
}
