import { ReactNode, useLayoutEffect, useRef } from 'react';
import {
  Group,
  Layout,
  Panel,
  Separator,
  useDefaultLayout,
  useGroupRef,
  usePanelRef,
} from 'react-resizable-panels';

import { cn } from '@/lib/utils';

import { layoutStorage } from './panelLayout';

export type SplitPane = {
  id: string;
  node: ReactNode;
  // Minimized to its title bar: it shrinks to it and the other pane takes
  // the rest; the handle is off until it comes back.
  collapsed?: boolean;
  // Its size until the user drags the handle (set on one pane; the other
  // takes the rest): a CSS size ("22rem", "66.667%"), or "content" for
  // its content's own height (the enemy card).
  defaultSize?: string;
  minSize?: string;
  // Keeps its size in pixels when the window changes (a sidebar), instead
  // of its share of the split.
  keepPixels?: boolean;
};

type ResizableSplitProps = {
  // Its sizes are remembered under this id.
  id: string;
  orientation: 'horizontal' | 'vertical';
  panes: [SplitPane, SplitPane];
  className?: string;
};

// Two panels with a handle between them to resize them; the sizes the user
// drags to come back on reload.
const ResizableSplit = ({
  id,
  orientation,
  panes,
  className,
}: ResizableSplitProps) => {
  const [first, second] = panes;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `genshin-sim:split:${id}`,
    storage: layoutStorage,
    // A minimized pane's size is never saved: only what the user drags.
    onlySaveAfterUserInteractions: true,
  });
  const groupRef = useGroupRef();
  const panelRefs = [usePanelRef(), usePanelRef()];
  const contentRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  // The last size the user chose, to go back to when a pane comes back;
  // null until they drag a handle (then the defaults apply).
  const chosen = useRef<Layout | null>(defaultLayout ?? null);
  const collapsed = [first.collapsed === true, second.collapsed === true];
  const vertical = orientation === 'vertical';

  const groupElement = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    if (!collapsed[0] && !collapsed[1]) {
      if (chosen.current) {
        group.setLayout(chosen.current);
        return;
      }
      // The defaults: the pane that has one gets it, the other the rest.
      const index = first.defaultSize !== undefined ? 0 : 1;
      const size = panes[index].defaultSize;
      if (size === 'content') {
        const content = contentRefs[index].current?.firstElementChild;
        if (content instanceof HTMLElement) {
          // All of it (scrolled out of sight too) plus its borders.
          const own = vertical
            ? content.scrollHeight + content.offsetHeight - content.clientHeight
            : content.scrollWidth + content.offsetWidth - content.clientWidth;
          panelRefs[index].current?.resize(`${own}px`);
        }
      } else if (size !== undefined) {
        panelRefs[index].current?.resize(size);
      }
      return;
    }
    // A minimized pane is as tall as its title bar (what it renders now),
    // and follows it: the bar can wrap when the column gets narrower, and
    // the split's own size changes with the window.
    const index = collapsed[0] ? 0 : 1;
    const fit = () => {
      const content = contentRefs[index].current?.firstElementChild;
      if (!(content instanceof HTMLElement)) {
        return;
      }
      const size =
        orientation === 'vertical' ? content.offsetHeight : content.offsetWidth;
      const current = panelRefs[index].current?.getSize().inPixels;
      if (current === undefined || Math.abs(current - size) >= 1) {
        panelRefs[index].current?.resize(`${size}px`);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    const content = contentRefs[index].current?.firstElementChild;
    if (content) {
      observer.observe(content);
    }
    if (groupElement.current) {
      observer.observe(groupElement.current);
    }
    return () => observer.disconnect();
    // Both refs are stable; only the panes' state matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed[0], collapsed[1], orientation]);

  return (
    <Group
      id={`split-${id}`}
      groupRef={groupRef}
      elementRef={groupElement}
      orientation={orientation}
      defaultLayout={chosen.current ?? undefined}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) {
          chosen.current = meta.requestedLayout ?? layout;
          onLayoutChanged(layout, meta);
        }
      }}
      className={cn('min-h-0', className)}
    >
      {panes.map((pane, index) => [
        index === 1 && (
          <Separator
            key='handle'
            disabled={collapsed[0] || collapsed[1]}
            className={cn(
              'group flex shrink-0 items-center justify-center outline-none',
              vertical ? 'h-4 cursor-row-resize' : 'w-4 cursor-col-resize',
              (collapsed[0] || collapsed[1]) && 'pointer-events-none'
            )}
          >
            {/* A faint grip that lights up on hover, drag or focus. */}
            <span
              className={cn(
                'rounded-full bg-slate-700/0 transition-colors group-hover:bg-sky-500/70 group-focus-visible:bg-sky-500/70 group-data-[separator=active]:bg-sky-500',
                vertical ? 'h-1 w-12' : 'h-12 w-1'
              )}
            />
          </Separator>
        ),
        <Panel
          key={pane.id}
          id={pane.id}
          panelRef={panelRefs[index]}
          minSize={collapsed[index] ? undefined : pane.minSize}
          defaultSize={
            pane.defaultSize === 'content' ? undefined : pane.defaultSize
          }
          groupResizeBehavior={
            pane.keepPixels ? 'preserve-pixel-size' : 'preserve-relative-size'
          }
          className='min-h-0'
        >
          <div
            ref={contentRefs[index]}
            className={cn('flex h-full min-h-0 flex-col', vertical && 'w-full')}
          >
            {pane.node}
          </div>
        </Panel>,
      ])}
    </Group>
  );
};

export default ResizableSplit;
