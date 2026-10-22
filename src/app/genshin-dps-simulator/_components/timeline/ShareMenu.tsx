import {
  ArrowLeftRight,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  FileUp,
  Link2,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

import {
  decodeSharedRotation,
  encodeSharedRotation,
  SharedRotation,
  shareLink,
  toSharedJson,
} from './shareRotation';

type ShareMenuProps = {
  // What is on screen now: the team, its builds and its rotation.
  current: SharedRotation;
  // A short name for it (the team's), for the file.
  label: string;
  // Loads a friend's rotation; returns why it cannot, or null when done.
  onImport: (shared: SharedRotation) => string | null;
};

// The timeline's Import / Export menu: share a team, its builds and its
// rotation with a friend (a code, a link or a file), or load theirs. Each
// way is its own option.
const ShareMenu = ({ current, label, onImport }: ShareMenuProps) => {
  // A short message by the button after an option (copied, loaded…).
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null
  );
  const noticeTimer = useRef<number | undefined>(undefined);
  // The paste window: open, what is typed, and why it did not load.
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // The paste window opens from the menu, not from a trigger of its own:
  // closing it gives the focus back to the menu's button.
  const trigger = useRef<HTMLButtonElement>(null);
  // Set when the menu closes into the paste window: the window opens once
  // the menu is gone, so the menu's focus handling does not take the
  // focus away from the window's field.
  const toPasteWindow = useRef(false);

  const notify = (text: string, isError = false) => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ text, error: isError });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  };

  const copy = async (what: 'code' | 'link') => {
    try {
      const code = await encodeSharedRotation(current);
      await navigator.clipboard.writeText(
        what === 'code' ? code : shareLink(code, window.location.href)
      );
      notify(what === 'code' ? 'Code copied' : 'Link copied');
    } catch {
      notify('Could not copy to the clipboard', true);
    }
  };

  const download = () => {
    const blob = new Blob([toSharedJson(current)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-rotation.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('File downloaded');
  };

  // Loads what a friend sent; null when it loaded, else why not.
  const load = async (text: string): Promise<string | null> => {
    try {
      return onImport(await decodeSharedRotation(text));
    } catch (failure) {
      return failure instanceof Error
        ? failure.message
        : 'It could not be read.';
    }
  };

  const importPasted = async () => {
    setBusy(true);
    const problem = await load(pasted);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setPasting(false);
    setPasted('');
    notify('Rotation loaded');
  };

  return (
    <div className='relative'>
      {/* Not modal: a modal menu that opens the paste window leaves the page
          without pointer events once that window closes (Radix). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant='secondary'
            size='sm'
            data-testid='timeline-share'
            aria-label='Import / Export'
            title='Share this team, or load a friend’s'
            className='bg-panel font-medium data-[state=open]:bg-accent/70'
          >
            <ArrowLeftRight />
            {/* Narrow screens: the icon only. */}
            <span className='hidden sm:inline'>Import / Export</span>
            <ChevronDown className='size-3 text-subtle' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-testid='timeline-share-menu'
          align='end'
          sideOffset={6}
          onCloseAutoFocus={(event) => {
            if (toPasteWindow.current) {
              event.preventDefault();
              toPasteWindow.current = false;
              setPasting(true);
            }
          }}
          className='w-64'
        >
          <DropdownMenuLabel>Export</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid='timeline-share-copy-code'
            icon={<Copy />}
            description='A short code to paste in a chat'
            onSelect={() => copy('code')}
          >
            Copy code
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid='timeline-share-copy-link'
            icon={<Link2 />}
            description='Opens the simulator with this team'
            onSelect={() => copy('link')}
          >
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid='timeline-share-download'
            icon={<Download />}
            description='A .json file to send or keep'
            onSelect={download}
          >
            Download file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Import</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid='timeline-share-paste-option'
            icon={<ClipboardPaste />}
            description='From a friend’s code or link'
            onSelect={() => {
              toPasteWindow.current = true;
              setError(null);
            }}
          >
            Paste code or link…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid='timeline-share-open-file'
            icon={<FileUp />}
            description='From a downloaded .json file'
            onSelect={() => fileInput.current?.click()}
          >
            Open file…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInput}
        type='file'
        data-testid='timeline-share-file'
        accept='.json,application/json,.txt,text/plain'
        className='hidden'
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) {
            return;
          }
          const problem = await load(await file.text());
          if (problem) {
            notify(problem, true);
          } else {
            notify('Rotation loaded');
          }
        }}
      />

      {notice && (
        <span
          role={notice.error ? 'alert' : 'status'}
          data-testid='timeline-share-notice'
          className={cn(
            'absolute top-full right-0 z-40 mt-1.5 rounded-md border px-2 py-1 text-2xs whitespace-nowrap shadow-lg',
            notice.error
              ? 'border-rose-500/40 bg-rose-950 text-rose-200'
              : 'border-emerald-500/40 bg-emerald-950 text-emerald-200'
          )}
        >
          {notice.text}
        </span>
      )}

      <Dialog
        open={pasting}
        onOpenChange={(open) => {
          setPasting(open);
          setError(null);
        }}
      >
        <DialogContent
          data-testid='timeline-share-dialog'
          className='w-[min(30rem,calc(100vw-2rem))]'
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Import a rotation</DialogTitle>
            <DialogDescription className='text-subtle'>
              Paste the code or the link a friend sent. It replaces the team on
              screen, its builds and your saved rotation for that team.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            data-testid='timeline-share-paste'
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
              setError(null);
            }}
            placeholder='gsim2.… or https://…?share=…'
            className='h-24 font-mono text-2xs break-all text-muted-foreground'
          />
          {error && (
            <p
              role='alert'
              data-testid='timeline-share-error'
              className='text-xs text-rose-300'
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='ghost' size='sm'>
                Cancel
              </Button>
            </DialogClose>
            <Button
              size='sm'
              data-testid='timeline-share-import'
              disabled={busy || pasted.trim() === ''}
              onClick={importPasted}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShareMenu;
