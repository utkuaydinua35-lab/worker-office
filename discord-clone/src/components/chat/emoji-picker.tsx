'use client';

import { Smile } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * emoji-mart's framework-free picker (a web component), mounted into a div.
 * The React wrapper package stopped at React 18. Its data is ~400 KB, so it
 * loads on first open, not with the page.
 */
function EmojiMartPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    void Promise.all([
      import('emoji-mart'),
      import('@emoji-mart/data'),
      import('@emoji-mart/data/i18n/tr.json'),
    ]).then(([{ Picker }, { default: data }, { default: i18n }]) => {
      if (cancelled || !host) return;
      const picker = new Picker({
        data,
        // Passing i18n inline keeps emoji-mart from fetching it from a CDN.
        i18n,
        locale: 'tr',
        theme: 'dark',
        previewPosition: 'none',
        onEmojiSelect: (emoji: { native: string }) => onSelectRef.current(emoji.native),
      });
      host.replaceChildren(picker as unknown as Node);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      host?.replaceChildren();
    };
  }, []);

  return (
    <div ref={hostRef} className={loading ? 'h-[435px] w-[352px]' : undefined} aria-busy={loading} />
  );
}

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Emoji"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Smile className="h-6 w-6" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={16} className="border-none bg-transparent shadow-none">
        <EmojiMartPicker onSelect={onSelect} />
      </PopoverContent>
    </Popover>
  );
}
