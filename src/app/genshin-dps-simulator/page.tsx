import { Metadata } from 'next';

import CombatTimelinePage from './_components/timeline/CombatTimelinePage';

export const metadata: Metadata = {
  title: 'Combat Timeline',
};

export default function GenshinDpsSimulatorPage() {
  return <CombatTimelinePage />;
}
