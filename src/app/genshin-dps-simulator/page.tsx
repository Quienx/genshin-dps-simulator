import { Metadata } from 'next';

import DamageSimulator from './_components/DamageSimulator';

export const metadata: Metadata = {
  title: 'Genshin Impact Damage Simulator',
};

export default function GenshinDpsSimulatorPage() {
  return <DamageSimulator />;
}
