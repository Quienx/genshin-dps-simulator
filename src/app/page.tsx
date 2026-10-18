import { Metadata } from 'next';

import CombatTimelinePage from './genshin-dps-simulator/_components/timeline/CombatTimelinePage';

export const metadata: Metadata = {
  title: 'Combat Timeline',
};

// The site is the simulator: its timeline is the home page.
export default function HomePage() {
  return <CombatTimelinePage />;
}
