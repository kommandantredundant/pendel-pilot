import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, Loader2, Zap, Route, LayoutDashboard } from "lucide-react";
import { saveErrorMessage, useSaveSettings, useSettings } from "@/hooks/use-settings";
import { SettingsSideSection } from "@/components/settings-side-section";
import { ErrorDisplay } from "@/components/error-display";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";
import { isStorageAvailable } from "@/lib/settings-storage";
import { SIDE_FIELDS, settingsFormSchema, type SettingsFormValues } from "@/lib/settings-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/segmented-control";
import { useDeviceClass } from "@/hooks/use-active-view";
import { choiceFlags, storedChoice } from "@/lib/view-mode";
import { cn } from "@/lib/utils";
import { isAppError } from "@/lib/app-error";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Side = "home" | "work";

/** What the header shows about automatic saving. */
type SaveState = "idle" | "saving" | "saved" | "incomplete" | "failed";

interface SaveRequest {
  /** Look up both addresses again even if unchanged ("Recalculate routes"). */
  force?: boolean;
  /** The address of this side was just left; a failed lookup is shown at that field. */
  addressSide?: Side;
  /** Committed address of that side before this change, restored when its lookup fails. */
  previousAddress?: string;
}

/** Quiet time after the last change before saving, so typing mm:ss or picking a station saves once. */
const SAVE_DELAY_MS = 700;

/** Hash that opens and scrolls to the routing section (start page "Set up your commute"). */
export const ROUTING_HASH = "#routing";

/**
 * Settings save themselves: every valid change is stored after a short pause, addresses when their field is left
 * (they are looked up with an external service). Order: view, long-distance trains, then routing (home and work)
 * in a section that is open during first setup or when arriving via ROUTING_HASH.
 */
export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { data: settings, isLoading } = useSettings();
  const { mutateAsync: saveSettings } = useSaveSettings();
  const storageAvailable = isStorageAvailable();
  const { mobile, wide } = useDeviceClass();

  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Bumped on every successful save, so "Saved" stays visible for its full time after each one.
  const [savedCount, setSavedCount] = useState(0);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);

  const loaded = useRef(false);
  // Addresses as last left by the user; saves use these, so a half-typed address is never looked up.
  const committed = useRef<Record<Side, string>>({ home: "", work: "" });
  const saving = useRef(false);
  const queued = useRef<SaveRequest | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const languageRef = useRef(language);
  languageRef.current = language;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    // Show a field's problem once it has been left, since there is no submit any more.
    mode: "onTouched",
    defaultValues: {
      homeAddress: "",
      homeStationId: "",
      homeStationName: "",
      workAddress: "",
      workStationId: "",
      workStationName: "",
      homeLeavingBufferSeconds: 0,
      workLeavingBufferSeconds: 0,
      homeBikeBufferSeconds: 0,
      workBikeBufferSeconds: 0,
      homeBikeParkingSeconds: 0,
      workBikeParkingSeconds: 0,
      homeWalkFixed: 0,
      homeBikeFixed: 0,
      workWalkFixed: 0,
      workBikeFixed: 0,
      excludeFernverkehr: 0,
      glanceMode: 0,
      planMode: 0,
      stationModeFromHome: "both",
      stationModeFromWork: "both",
      // First setup starts with the language the app is shown in (stored choice or browser language).
      language,
    },
  });

  const watchedGlance = form.watch("glanceMode");
  const watchedPlan = form.watch("planMode");

  /** Save the form as it stands (with committed addresses) if it is complete; one save at a time. */
  const runSave = async (request: SaveRequest) => {
    if (saving.current) {
      queued.current = { ...queued.current, ...request };
      return;
    }
    const values = form.getValues();
    const parsed = settingsFormSchema.safeParse({
      ...values,
      homeAddress: committed.current.home,
      workAddress: committed.current.work,
    });
    if (!parsed.success) {
      setSaveState("incomplete");
      return;
    }

    saving.current = true;
    setSaveState("saving");
    setSaveError(null);
    if (request.force) setRecalculating(true);
    try {
      await saveSettings({ settings: parsed.data, force: request.force });
      // A lookup problem is solved once a save gets through (both addresses were checked).
      for (const side of Object.keys(SIDE_FIELDS) as Side[]) {
        if (form.getFieldState(SIDE_FIELDS[side].address).error?.type === "lookup") form.clearErrors(SIDE_FIELDS[side].address);
      }
      setSaveState("saved");
      setSavedCount((count) => count + 1);
    } catch (error) {
      setSaveState("failed");
      // Lookup errors name their address field; a failed address of the field just left also restores its last good value.
      const fieldSide = isAppError(error) && error.field
        ? (Object.keys(SIDE_FIELDS) as Side[]).find((side) => SIDE_FIELDS[side].address === error.field)
        : undefined;
      const side = fieldSide ?? request.addressSide;
      if (side) {
        // Keep saving everything else with the last address that worked; the field keeps the new text and the error.
        if (side === request.addressSide && committed.current[side] === parsed.data[SIDE_FIELDS[side].address]) {
          committed.current[side] = request.previousAddress ?? "";
        }
        form.setError(SIDE_FIELDS[side].address, { type: "lookup", message: saveErrorMessage(error, languageRef.current) });
      } else {
        setSaveError(error);
      }
    } finally {
      saving.current = false;
      setRecalculating(false);
      const next = queued.current;
      queued.current = null;
      if (next) void saveRef.current(next);
    }
  };
  const saveRef = useRef(runSave);
  saveRef.current = runSave;

  // Load the stored profile once; later saves must not reset what is being typed.
  useEffect(() => {
    if (isLoading || loaded.current) return;
    loaded.current = true;
    if (settings) {
      form.reset(settings);
      setLanguage((settings.language as Language) || language);
      committed.current = { home: settings.homeAddress ?? "", work: settings.workAddress ?? "" };
    }
    setRoutingOpen(!settings || window.location.hash === ROUTING_HASH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, settings]);

  // Arriving via the start page: scroll the opened routing section into view.
  useEffect(() => {
    if (!routingOpen || window.location.hash !== ROUTING_HASH) return;
    requestAnimationFrame(() => document.getElementById("routing")?.scrollIntoView({ block: "start" }));
  }, [routingOpen]);

  // Save every change after a short pause; addresses save when their field is left (onAddressBlur).
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (!loaded.current || !name || name === "homeAddress" || name === "workAddress") return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        void saveRef.current({});
      }, SAVE_DELAY_MS);
    });
    return () => {
      subscription.unsubscribe();
      // Leaving the page right after a change: save it now instead of dropping it.
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        void saveRef.current({});
      }
    };
  }, [form]);

  // "Saved" is a short confirmation, not a lasting state.
  useEffect(() => {
    if (saveState !== "saved") return;
    const id = window.setTimeout(() => setSaveState("idle"), 2500);
    return () => window.clearTimeout(id);
  }, [saveState, savedCount]);

  const onAddressBlur = (side: Side) => {
    const value = String(form.getValues(SIDE_FIELDS[side].address) ?? "");
    if (value === committed.current[side]) return;
    const previousAddress = committed.current[side];
    committed.current[side] = value;
    void saveRef.current({ addressSide: side, previousAddress });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg bg-card" />
        <Skeleton className="h-[400px] w-full rounded-2xl bg-card" />
      </div>
    );
  }

  /** The stored lookup result, as long as the field still shows the address it belongs to. */
  const foundAddress = (side: Side): string | undefined => {
    const typed = String(form.watch(SIDE_FIELDS[side].address) ?? "");
    const looked = side === "home" ? settings?.routingInputFingerprint?.homeAddress : settings?.routingInputFingerprint?.workAddress;
    return typed && typed === looked ? (side === "home" ? settings?.homeAddressLabel : settings?.workAddressLabel) : undefined;
  };

  const homeStation = form.watch("homeStationName");
  const workStation = form.watch("workStationName");
  const routingSummary = homeStation && workStation
    ? `${homeStation} ↔ ${workStation}`
    : t('settings.routing.missing', language);

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {!storageAvailable && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t('settings.storage.disabled', language)}
        </div>
      )}

      {!!saveError && (
        <ErrorDisplay
          error={saveError}
          language={language}
          showFixAction={false}
        />
      )}

      <div className="sticky top-[calc(3rem+var(--safe-top))] z-10 flex items-center justify-between gap-3 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 -mx-2 px-2">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{t('settings.title', language)}</h1>
          <SaveStatus state={saveState} language={language} />
        </div>
        <Select value={language} onValueChange={(val) => { const lang = val as Language; setLanguage(lang); form.setValue('language', lang, { shouldDirty: true }); }}>
          <SelectTrigger className="w-24 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('language.en', language)}</SelectItem>
            <SelectItem value="de">{t('language.de', language)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Form {...form}>
        {/* Nothing to submit: changes save themselves. Enter in a field must not reload the page. */}
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4">

          {/* Dashboard view: one choice; phones never offer Planner, narrow windows fall back to classic */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutDashboard className="w-4 h-4 text-muted-foreground" /> {t('settings.view.title', language)}
              </CardTitle>
              <CardDescription>{t('settings.view.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="planMode"
                render={() => {
                  const choice = storedChoice({ glanceMode: watchedGlance, planMode: watchedPlan }, mobile);
                  const planHint = mobile
                    ? t('settings.view.plan.mobile', language)
                    : choice === "plan" && !wide
                      ? t('settings.view.plan.narrow', language)
                      : null;
                  return (
                    <FormItem className="space-y-3">
                      <SegmentedControl
                        ariaLabel={t('settings.view.title', language)}
                        value={choice}
                        onChange={(next) => {
                          const flags = choiceFlags(next);
                          form.setValue("glanceMode", flags.glanceMode, { shouldDirty: true });
                          form.setValue("planMode", flags.planMode, { shouldDirty: true });
                        }}
                        options={[
                          { value: "classic", label: t('view.classic', language) },
                          { value: "glance", label: t('view.glance', language) },
                          { value: "plan", label: t('view.plan', language), disabled: mobile, title: mobile ? t('settings.view.plan.mobile', language) : undefined },
                        ]}
                      />
                      <FormDescription>{t(`settings.view.${choice}.desc`, language)}</FormDescription>
                      {planHint && <p className="text-sm text-muted-foreground">{planHint}</p>}
                    </FormItem>
                  );
                }}
              />
            </CardContent>
          </Card>

          {/* Train Preferences */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-muted-foreground" /> {t('settings.trains', language)}
              </CardTitle>
              <CardDescription>{t('settings.trains.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="excludeFernverkehr"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value === 1}
                        onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                      />
                    </FormControl>
                    <div className="flex-1">
                      <FormLabel className="cursor-pointer font-medium">{t('settings.trains.exclude', language)}</FormLabel>
                      <FormDescription>{t('settings.trains.exclude.desc', language)}</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Routing: home and work in one section that opens on demand */}
          <Collapsible open={routingOpen} onOpenChange={setRoutingOpen} className="space-y-4">
            {/* Scroll margin keeps the section clear of the sticky title bar and settings header. */}
            <Card id="routing" className="bg-card border-border/70 shadow-sm rounded-xl scroll-mt-[calc(7.5rem+var(--safe-top))]">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-6 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
                      <Route className="w-4 h-4 text-muted-foreground" /> {t('settings.routing.title', language)}
                    </div>
                    <p className={cn("text-sm text-muted-foreground", !routingOpen && "truncate")}>
                      {routingOpen ? t('settings.routing.desc', language) : routingSummary}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-200", routingOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
            </Card>

            <CollapsibleContent className="space-y-4">
              {settings?.routingCalculatedAt && (
                <Alert className="border-border/70 bg-card">
                  <Route className="h-4 w-4 text-muted-foreground" />
                  <AlertDescription className="text-muted-foreground text-xs flex items-center justify-between gap-3">
                    <span>{t('settings.routes.calculated', language)} {new Date(settings.routingCalculatedAt).toLocaleString()}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void saveRef.current({ force: true })}
                      disabled={saveState === "saving"}
                      className="shrink-0"
                    >
                      {recalculating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('settings.routes.recalculating', language)}
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" /> {t('settings.routes.recalculate', language)}
                        </>
                      )}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {(["home", "work"] as const).map((side) => (
                <SettingsSideSection
                  key={side}
                  side={side}
                  form={form}
                  language={language}
                  onAddressBlur={onAddressBlur}
                  foundAddress={foundAddress(side)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>

        </form>
      </Form>
    </div>
  );
}

/** Quiet saving state next to the page title; problems themselves are shown at their fields. */
function SaveStatus({ state, language }: { state: SaveState; language: Language }) {
  if (state === "idle") return null;
  const tone = state === "failed" ? "text-destructive" : state === "incomplete" ? "text-late" : "text-muted-foreground";
  return (
    <span role="status" className={cn("flex items-center gap-1 text-xs font-medium truncate", tone)}>
      {state === "saving" && <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />}
      {state === "saved" && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {t(`settings.autosave.${state}`, language)}
    </span>
  );
}
