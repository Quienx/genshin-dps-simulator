import { CircleHelp, Info } from 'lucide-react';
import { memo, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Kbd } from '@/components/ui/kbd';
import { SectionLabel } from '@/components/ui/section-label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { SECTION_HELP, SectionHelpKey, SectionHelpText } from './sectionHelp';

// A line of help: `backticks` become chips (a key, a gesture, a term).
const Rich = ({ text }: { text: string }) => (
  <>
    {text
      .split('`')
      .map((part, index) =>
        index % 2 === 1 ? <Kbd key={index}>{part}</Kbd> : part
      )}
  </>
);

const List = ({ title, items }: { title: string; items: string[] }) => (
  <div>
    <SectionLabel className='mb-1'>{title}</SectionLabel>
    <ul className='flex flex-col gap-1'>
      {items.map((item) => (
        <li key={item} className='flex gap-1.5'>
          <span
            aria-hidden
            className='mt-[5px] size-1 shrink-0 rounded-full bg-brand-400/80'
          />
          <span>
            <Rich text={item} />
          </span>
        </li>
      ))}
    </ul>
  </div>
);

// The tooltip's body: title, what it is, what it shows, how to use it, and
// a note.
const HelpBody = ({ help }: { help: SectionHelpText }): ReactNode => (
  <div className='flex flex-col gap-2'>
    <div>
      <p className='text-xs font-semibold text-foreground'>{help.title}</p>
      <p className='mt-0.5 text-muted-foreground'>
        <Rich text={help.summary} />
      </p>
    </div>
    {help.shows && <List title='What it shows' items={help.shows} />}
    {help.use && <List title='How to use it' items={help.use} />}
    {help.note && (
      <p className='flex gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-amber-100/90'>
        <Info className='mt-px size-3 shrink-0 text-amber-300' aria-hidden />
        <span>
          <Rich text={help.note} />
        </span>
      </p>
    )}
  </div>
);

// A section's "?": hovering it (or focusing it) explains what the section
// does and shows. Inside a clickable header it does not toggle it.
const SectionHelp = ({
  section,
  className,
}: {
  section: SectionHelpKey;
  className?: string;
}) => {
  const help: SectionHelpText = SECTION_HELP[section];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role='img'
          tabIndex={0}
          data-testid={`section-help-${section}`}
          aria-label={`${help.title}: ${help.summary}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex shrink-0 cursor-help items-center text-subtle transition-colors outline-none hover:text-brand-300 focus-visible:text-brand-300',
            className
          )}
        >
          <CircleHelp className='size-3.5' aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side='bottom'
        align='start'
        collisionPadding={12}
        className='w-[22rem] max-w-[calc(100vw-24px)] p-3 text-left leading-relaxed font-normal tracking-normal normal-case shadow-xl'
      >
        {/* At most half the window (or the room there is): a long help
            scrolls inside, the pointer can move into it to scroll. */}
        <div className='max-h-[min(50vh,calc(var(--radix-tooltip-content-available-height)-24px))] overflow-y-auto overscroll-contain pr-1'>
          <HelpBody help={help} />
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// Its text never changes: drawn again only for another section.
export default memo(SectionHelp);
