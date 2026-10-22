'use client'; // Error components must be Client Components

import { TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className='flex h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center'>
      <TriangleAlert className='size-12 text-rose-400' aria-hidden />
      <h1 className='text-2xl font-semibold text-foreground'>
        Something went wrong
      </h1>
      <p className='max-w-sm text-sm text-subtle'>
        The page hit an error. Trying again usually brings it back.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
