import { TriangleAlert } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Not Found',
};

export default function NotFound() {
  return (
    <main className='flex h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center'>
      <TriangleAlert className='size-12 text-amber-300' aria-hidden />
      <h1 className='text-2xl font-semibold text-foreground'>Page not found</h1>
      <p className='max-w-sm text-sm text-subtle'>
        There is nothing at this address.
      </p>
      <Button asChild>
        <Link href='/'>Back to the timeline</Link>
      </Button>
    </main>
  );
}
