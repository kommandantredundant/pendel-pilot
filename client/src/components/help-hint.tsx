import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t, type Language } from "@/lib/i18n";

/** A (?) button that shows an explanation as a popup on click or tap, instead of text that is always visible. */
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
      <PopoverContent side="top" className="w-64 p-3 text-sm leading-snug">
        {text}
      </PopoverContent>
    </Popover>
  );
}
