import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  ArrowLeftRight,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  FileUp,
  Link2,
  XIcon,
} from 'lucide-react';
import { ReactNode, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

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

const MenuItem = ({
  icon,
  children,
  hint,
  testId,
  onSelect,
}: {
  icon: ReactNode;
  children: ReactNode;
  hint: string;
  testId: string;
  onSelect: () => void;
}) => (
  <Menu.Item
    data-testid={testId}
    onSelect={onSelect}
    className='flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 outline-none select-none data-[highlighted]:bg-slate-800'
  >
    <span className='mt-0.5 text-slate-400'>{icon}</span>
    <span className='flex flex-col'>
      <span className='text-xs font-medium text-slate-100'>{children}</span>
      <span className='text-[10px] text-slate-500'>{hint}</span>
    </span>
  </Menu.Item>
);

const MenuLabel = ({ children }: { children: ReactNode }) => (
  <Menu.Label className='px-2 pt-1.5 pb-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase'>
    {children}
  </Menu.Label>
);

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
      <Menu.Root>
        <Menu.Trigger asChild>
          <button
            type='button'
            data-testid='timeline-share'
            aria-label='Import / Export'
            title='Share this team, or load a friend’s'
            className='flex h-8 items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-900/70 px-2.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700/70 data-[state=open]:bg-slate-700/70'
          >
            <ArrowLeftRight className='size-3.5' />
            {/* Narrow screens: the icon only. */}
            <span className='hidden sm:inline'>Import / Export</span>
            <ChevronDown className='size-3 text-slate-500' />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            data-testid='timeline-share-menu'
            align='end'
            sideOffset={6}
            className='z-50 w-64 rounded-lg border border-slate-700/60 bg-slate-900 p-1 text-slate-100 shadow-xl'
          >
            <MenuLabel>Export</MenuLabel>
            <MenuItem
              testId='timeline-share-copy-code'
              icon={<Copy className='size-3.5' />}
              hint='A short code to paste in a chat'
              onSelect={() => copy('code')}
            >
              Copy code
            </MenuItem>
            <MenuItem
              testId='timeline-share-copy-link'
              icon={<Link2 className='size-3.5' />}
              hint='Opens the simulator with this team'
              onSelect={() => copy('link')}
            >
              Copy link
            </MenuItem>
            <MenuItem
              testId='timeline-share-download'
              icon={<Download className='size-3.5' />}
              hint='A .json file to send or keep'
              onSelect={download}
            >
              Download file
            </MenuItem>
            <Menu.Separator className='my-1 h-px bg-slate-700/60' />
            <MenuLabel>Import</MenuLabel>
            <MenuItem
              testId='timeline-share-paste-option'
              icon={<ClipboardPaste className='size-3.5' />}
              hint='From a friend’s code or link'
              onSelect={() => {
                setError(null);
                setPasting(true);
              }}
            >
              Paste code or link…
            </MenuItem>
            <MenuItem
              testId='timeline-share-open-file'
              icon={<FileUp className='size-3.5' />}
              hint='From a downloaded .json file'
              onSelect={() => fileInput.current?.click()}
            >
              Open file…
            </MenuItem>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

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
            'absolute top-full right-0 z-40 mt-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-lg',
            notice.error
              ? 'border-rose-500/40 bg-rose-950 text-rose-200'
              : 'border-emerald-500/40 bg-emerald-950 text-emerald-200'
          )}
        >
          {notice.text}
        </span>
      )}

      <Dialog.Root
        open={pasting}
        onOpenChange={(open) => {
          setPasting(open);
          setError(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className='fixed inset-0 z-50 bg-black/60' />
          <Dialog.Content
            data-testid='timeline-share-dialog'
            className='fixed top-1/2 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900 p-4 text-slate-100 shadow-xl'
          >
            <div className='flex items-center justify-between'>
              <Dialog.Title className='text-sm font-semibold text-slate-50'>
                Import a rotation
              </Dialog.Title>
              <Dialog.Close
                aria-label='Close'
                className='rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              >
                <XIcon className='size-4' />
              </Dialog.Close>
            </div>
            <Dialog.Description className='text-xs text-slate-400'>
              Paste the code or the link a friend sent. It replaces the team on
              screen, its builds and your saved rotation for that team.
            </Dialog.Description>
            <textarea
              autoFocus
              data-testid='timeline-share-paste'
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setError(null);
              }}
              placeholder='gsim1.… or https://…?share=…'
              className='h-24 resize-none rounded-md border border-slate-700/60 bg-slate-950/60 p-2 font-mono text-[10px] break-all text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:ring-0'
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
            <div className='flex justify-end gap-2'>
              <Dialog.Close className='h-8 rounded-md px-3 text-xs text-slate-300 hover:bg-slate-800'>
                Cancel
              </Dialog.Close>
              <button
                type='button'
                data-testid='timeline-share-import'
                disabled={busy || pasted.trim() === ''}
                onClick={importPasted}
                className='flex h-8 items-center rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40'
              >
                Import
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default ShareMenu;
