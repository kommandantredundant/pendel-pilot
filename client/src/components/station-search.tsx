import { useState, useEffect } from "react";
import { useDebounce } from "use-debounce";
import { Check, ChevronsUpDown, MapPin, Loader2 } from "lucide-react";
import { useStationSearch } from "@/hooks/use-transport";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "./layout";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";

interface StationSearchProps {
  value?: string;
  stationName?: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
}

export function StationSearch({ value, stationName, onChange, placeholder }: StationSearchProps) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery] = useDebounce(inputValue, 400);
  
  const { data: stations, isLoading } = useStationSearch(debouncedQuery);
  const defaultPlaceholder = t('station.search.placeholder', language);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background border-border/50 hover:bg-secondary/50 hover:border-border h-12 rounded-xl text-left font-normal"
        >
          <div className="flex items-center gap-2 truncate">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={cn("truncate", !stationName && "text-muted-foreground")}>
              {stationName || placeholder || defaultPlaceholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border border-border">
        <Command>
          <CommandInput
            placeholder={t('station.search.type', language)}
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList className="max-h-[300px] overflow-y-auto p-1">
            {isLoading && (
              <div className="py-6 flex justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            
            {!isLoading && debouncedQuery.length >= 2 && stations?.length === 0 && (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {t('station.search.no-results', language)}
              </CommandEmpty>
            )}
            
            {!isLoading && debouncedQuery.length < 2 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('station.search.min-chars', language)}
              </div>
            )}

            <CommandGroup>
              {stations?.map((station) => (
                <CommandItem
                  key={station.id}
                  value={station.name}
                  onSelect={() => {
                    onChange(station.id, station.name);
                    setOpen(false);
                    setInputValue("");
                  }}
                  className="rounded-lg cursor-pointer my-1 aria-selected:bg-primary/10 aria-selected:text-primary"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0 text-primary",
                      value === station.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{station.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
