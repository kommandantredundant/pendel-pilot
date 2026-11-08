import { CircleHelp, X } from "lucide-react";
import { PopoverClose } from "@radix-ui/react-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t, type Language } from "@/lib/i18n";

/**
 * A (?) button that shows an explanation as a popup on click or tap, instead of text that is always visible.
 * The popup closes with its x, with Escape, or with a click or tap anywhere outside it.
 */
export function HelpHint({ text, language }: { text: string; language: Language }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={t("help.label", language)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent side="top" className="relative w-64 py-3 pl-3 pr-8 text-sm leading-snug">
        {text}
        <PopoverClose
          aria-label={t("help.close", language)}
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}
