import { Maximize2, Minus } from 'lucide-react';

type PanelToggleProps = {
  // The panel's name, for the button's label.
  label: string;
  collapsed: boolean;
  onToggle: () => void;
};

// Minimizes a panel to its title bar, or brings it back.
const PanelToggle = ({ label, collapsed, onToggle }: PanelToggleProps) => (
  <button
    type='button'
    aria-label={collapsed ? `Expand ${label}` : `Minimize ${label}`}
    aria-expanded={!collapsed}
    title={collapsed ? 'Expand' : 'Minimize'}
    onClick={onToggle}
    className='flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700/70 hover:text-slate-100'
  >
    {collapsed ? (
      <Maximize2 className='size-3' aria-hidden />
    ) : (
      <Minus className='size-3.5' aria-hidden />
    )}
  </button>
);

export default PanelToggle;
