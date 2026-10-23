'use client';

import { useVirtualizer, Virtualizer } from '@tanstack/react-virtual';
import * as React from 'react';

import { cn } from '@/lib/utils';

// A long list that scrolls and only draws the rows near the view
// (TanStack Virtual), in parts that share it through context, as Radix
// and shadcn's do. A row is any component: it reads the item it draws
// with `useVirtualListItem`, and knows nothing of the virtualizing:
//
//   <VirtualList items={rows} getKey={(row) => row.key} estimateSize={29}>
//     <VirtualListViewport className='min-h-0 flex-1'>
//       <VirtualListItems>
//         <Row />
//       </VirtualListItems>
//       <VirtualListEmpty>Nothing yet.</VirtualListEmpty>
//     </VirtualListViewport>
//   </VirtualList>
//
// Rows coming in above while the list is scrolled down (a newest-first
// log) leave the row in view where it is; at the top, they show there.

type VirtualListContextValue = {
  items: readonly unknown[];
  virtualizer: Virtualizer<HTMLUListElement, Element>;
  scrollRef: React.RefObject<HTMLUListElement | null>;
  keepAnchor: () => void;
};

const VirtualListContext = React.createContext<VirtualListContextValue | null>(
  null
);

const useVirtualList = (part: string) => {
  const context = React.useContext(VirtualListContext);
  if (!context) {
    throw new Error(`<${part}> must be inside <VirtualList>`);
  }
  return context;
};

type VirtualListProps<T> = {
  items: readonly T[];
  // A stable key per item: its measured height goes with it when items
  // come in above it.
  getKey: (item: T, index: number) => string;
  // A row's usual height (px); each one is measured once drawn.
  estimateSize: number;
  // Rows kept drawn past each edge of the view.
  overscan?: number;
  children: React.ReactNode;
};

function VirtualList<T>({
  items,
  getKey,
  estimateSize,
  overscan = 8,
  children,
}: VirtualListProps<T>) {
  const scrollRef = React.useRef<HTMLUListElement>(null);
  // Its instance changes as the list scrolls, by design: fine without
  // the React Compiler (not on in this app).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getKey(items[index], index),
    overscan,
    // React 19 warns about flushSync during a scroll.
    useFlushSync: false,
  });

  // The row at the top of the view and how far into it the view is, kept
  // as the list scrolls; when the items change, it goes back there.
  const anchor = React.useRef<{ key: React.Key; offset: number } | null>(null);
  const keepAnchor = React.useCallback(() => {
    const element = scrollRef.current;
    const item = element
      ? virtualizer.getVirtualItemForOffset(element.scrollTop)
      : undefined;
    anchor.current =
      element && item && element.scrollTop > 0
        ? { key: item.key, offset: element.scrollTop - item.start }
        : null;
  }, [virtualizer]);
  React.useLayoutEffect(() => {
    const kept = anchor.current;
    // Back at the top (even before its scroll event): new rows show there.
    if (kept && (scrollRef.current?.scrollTop ?? 0) > 0) {
      const index = items.findIndex(
        (item, at) => getKey(item, at) === kept.key
      );
      const start =
        index >= 0 ? virtualizer.measurementsCache[index]?.start : undefined;
      if (start !== undefined) {
        virtualizer.scrollToOffset(start + kept.offset);
      }
    }
    keepAnchor();
    // Only when the items change: scrolling keeps the anchor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // A new value on each render (the instance stays the same as it
  // scrolls), so the parts draw the rows now in view.
  const value: VirtualListContextValue = {
    items,
    virtualizer,
    scrollRef,
    keepAnchor,
  };
  return (
    <VirtualListContext.Provider value={value}>
      {children}
    </VirtualListContext.Provider>
  );
}

// The list that scrolls.
function VirtualListViewport({
  className,
  onScroll,
  ...props
}: React.ComponentProps<'ul'>) {
  const { scrollRef, keepAnchor } = useVirtualList('VirtualListViewport');
  return (
    <ul
      ref={scrollRef}
      data-slot='virtual-list-viewport'
      onScroll={(event) => {
        keepAnchor();
        onScroll?.(event);
      }}
      className={cn('overflow-y-auto', className)}
      {...props}
    />
  );
}

// The item a row draws, and its place in the list.
type VirtualListItemValue<T> = { item: T; index: number };

const VirtualListItemContext =
  React.createContext<VirtualListItemValue<unknown> | null>(null);

// In a row inside <VirtualListItems>: the item it draws.
function useVirtualListItem<T>(): VirtualListItemValue<T> {
  const context = React.useContext(VirtualListItemContext);
  if (!context) {
    throw new Error('useVirtualListItem must be inside <VirtualListItems>');
  }
  return context as VirtualListItemValue<T>;
}

// One row's item, the same value while its item and place stay: a
// memoized row is not drawn again as the list scrolls.
function ItemProvider({
  item,
  index,
  children,
}: VirtualListItemValue<unknown> & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ item, index }), [item, index]);
  return (
    <VirtualListItemContext.Provider value={value}>
      {children}
    </VirtualListItemContext.Provider>
  );
}

// The rows near the view: `children` (the row) once per item, inside a
// positioned wrapper of the list's own.
function VirtualListItems({ children }: { children: React.ReactNode }) {
  const { items, virtualizer } = useVirtualList('VirtualListItems');
  if (items.length === 0) {
    return null;
  }
  return (
    <li
      role='presentation'
      data-slot='virtual-list-items'
      className='relative'
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => (
        <div
          key={virtual.key}
          ref={virtualizer.measureElement}
          data-index={virtual.index}
          role='listitem'
          aria-setsize={items.length}
          aria-posinset={virtual.index + 1}
          className='absolute inset-x-0 top-0'
          style={{ transform: `translateY(${virtual.start}px)` }}
        >
          <ItemProvider item={items[virtual.index]} index={virtual.index}>
            {children}
          </ItemProvider>
        </div>
      ))}
    </li>
  );
}

// Shown instead of the rows when there are none.
function VirtualListEmpty(props: React.ComponentProps<'li'>) {
  const { items } = useVirtualList('VirtualListEmpty');
  return items.length === 0 ? (
    <li data-slot='virtual-list-empty' {...props} />
  ) : null;
}

export {
  useVirtualListItem,
  VirtualList,
  VirtualListEmpty,
  VirtualListItems,
  type VirtualListProps,
  VirtualListViewport,
};
