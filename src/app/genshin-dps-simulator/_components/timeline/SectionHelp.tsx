import { CircleHelp, Info } from 'lucide-react';
import { memo, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { SECTION_HELP, SectionHelpKey, SectionHelpText } from './sectionHelp';

// A line of help: `backticks` become chips (a key, a gesture, a term).
const Rich = ({ text }: { text: string }) => (
  <>
    {text.split('`').map((part, index) =>
      index % 2 === 1 ? (
        <kbd
          key={index}
          className='mx-px rounded border border-slate-600 bg-slate-800 px-1 py-px font-sans text-[10px] font-medium whitespace-nowrap text-sky-200'
        >
          {part}
        </kbd>
      ) : (
        part
      )
    )}
  </>
);

const List = ({ title, items }: { title: string; items: string[] }) => (
  <div>
    <p className='mb-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase'>
      {title}
    </p>
    <ul className='flex flex-col gap-1'>
      {items.map((item) => (
        <li key={item} className='flex gap-1.5'>
          <span
            aria-hidden
            className='mt-[5px] size-1 shrink-0 rounded-full bg-sky-400/80'
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
      <p className='text-xs font-semibold text-slate-50'>{help.title}</p>
      <p className='mt-0.5 text-slate-300'>
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
    <TooltipProvider delayDuration={150}>
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
              'inline-flex shrink-0 cursor-help items-center text-slate-500 transition-colors outline-none hover:text-sky-300 focus-visible:text-sky-300',
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
          className='w-[22rem] max-w-[calc(100vw-24px)] border-slate-700 bg-slate-900 p-3 text-left text-[11px] leading-relaxed font-normal tracking-normal text-balance text-slate-300 normal-case shadow-xl'
        >
          {/* At most half the window (or the room there is): a long help
              scrolls inside, the pointer can move into it to scroll. */}
          <div className='max-h-[min(50vh,calc(var(--radix-tooltip-content-available-height)-24px))] overflow-y-auto overscroll-contain pr-1'>
            <HelpBody help={help} />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Its text never changes: drawn again only for another section.
export default memo(SectionHelp);
