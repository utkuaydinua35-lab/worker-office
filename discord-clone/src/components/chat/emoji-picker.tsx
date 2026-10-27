'use client';

import { Smile } from 'lucide-react';
import dynamic from 'next/dynamic';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// emoji-mart's data is ~400 KB; load it only when the picker first opens.
const Picker = dynamic(
  async () => {
    const [{ default: EmojiMart }, { default: data }, { default: i18n }] = await Promise.all([
      import('@emoji-mart/react'),
      import('@emoji-mart/data'),
      import('@emoji-mart/data/i18n/tr.json'),
    ]);
    function TurkishPicker(props: { onEmojiSelect: (emoji: { native: string }) => void }) {
      // Passing i18n inline keeps emoji-mart from fetching it from a CDN.
      return <EmojiMart data={data} i18n={i18n} locale="tr" theme="dark" previewPosition="none" {...props} />;
    }
    return TurkishPicker;
  },
  { ssr: false, loading: () => <div className="h-[435px] w-[352px]" /> },
);

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
        <Picker onEmojiSelect={(emoji) => onSelect(emoji.native)} />
      </PopoverContent>
    </Popover>
  );
}
