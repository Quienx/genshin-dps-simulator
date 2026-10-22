import { Maximize2, Minus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PanelToggleProps = {
  // The panel's name, for the button's label.
  label: string;
  collapsed: boolean;
  onToggle: () => void;
};

// Minimizes a panel to its title bar, or brings it back.
const PanelToggle = ({ label, collapsed, onToggle }: PanelToggleProps) => (
  <Button
    variant='ghost'
    size='icon-sm'
    aria-label={collapsed ? `Expand ${label}` : `Minimize ${label}`}
    aria-expanded={!collapsed}
    title={collapsed ? 'Expand' : 'Minimize'}
    onClick={onToggle}
    className='text-subtle hover:not-disabled:bg-accent/70'
  >
    {collapsed ? <Maximize2 aria-hidden /> : <Minus aria-hidden />}
  </Button>
);

export default PanelToggle;
