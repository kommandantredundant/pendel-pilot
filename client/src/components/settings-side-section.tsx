import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Bike, Footprints, MapPin } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
import { StationSearch } from "@/components/station-search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMinutesSeconds, parseMinutesSeconds } from "@/lib/duration";
import { t, type Language } from "@/lib/i18n";
import { MAX_BUFFER_SECONDS, MAX_FIXED_SECONDS } from "@shared/client-schema";
import { SIDE_FIELDS, type SettingsFormValues } from "@/lib/settings-form";

const NUMBER_INPUT = "h-10 w-full rounded-lg bg-card font-mono-numbers max-w-[8rem]";

/** A form label followed by its (?) explanation. */
function LabelWithHelp({ label, help, language }: { label: string; help: string; language: Language }) {
  return (
    <div className="flex items-center gap-1.5">
      <FormLabel>{label}</FormLabel>
      <HelpHint text={help} language={language} />
    </div>
  );
}

/**
 * Everything about one end of the commute: address, station, how you get there, and the buffers and fixed times of
 * this place only. Home and work each get their own section, so no value is shared between the two (docs/decisions.md).
 */
export function SettingsSideSection({
  side,
  form,
  language,
}: {
  side: "home" | "work";
  form: UseFormReturn<SettingsFormValues>;
  language: Language;
}) {
  const fields = SIDE_FIELDS[side];
  const walkFixed = form.watch(fields.walkFixed) === 1;
  const bikeFixed = form.watch(fields.bikeFixed) === 1;
  const notRouted = walkFixed && bikeFixed;

  return (
    <Card className="bg-card border-border/70 shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="w-4 h-4 text-muted-foreground" /> {t(`settings.${side}`, language)}
        </CardTitle>
        <CardDescription>{t(`settings.${side}.desc`, language)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormField
          control={form.control}
          name={fields.address}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`settings.${side}.address`, language)}</FormLabel>
              <FormControl>
                {/* Disabled, not cleared: the address is back as soon as a fixed time is unticked. */}
                <Input
                  placeholder={t(`settings.${side}.address.placeholder`, language)}
                  className="h-10 rounded-lg bg-card"
                  {...field}
                  value={String(field.value ?? "")}
                  disabled={notRouted}
                />
              </FormControl>
              {notRouted && <FormDescription>{t("settings.address.unused", language)}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={fields.stationId}
          render={({ field }) => (
            <FormItem>
              {side === "home" ? (
                <LabelWithHelp label={t("settings.home.station", language)} help={t("settings.home.station.desc", language)} language={language} />
              ) : (
                <FormLabel>{t("settings.work.station", language)}</FormLabel>
              )}
              <FormControl>
                <StationSearch
                  value={String(field.value ?? "")}
                  stationName={String(form.watch(fields.stationName) ?? "")}
                  onChange={(id, name, location) => {
                    field.onChange(id);
                    form.setValue(fields.stationName, name, { shouldValidate: true });
                    form.setValue(fields.stationLat, location?.latitude);
                    form.setValue(fields.stationLon, location?.longitude);
                  }}
                  placeholder={t("station.search.placeholder", language)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={fields.stationMode}
          render={({ field }) => (
            <FormItem>
              <LabelWithHelp label={t("settings.station.mode", language)} help={t("settings.station.mode.desc", language)} language={language} />
              <Select value={String(field.value)} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-10 rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="bike">{t("settings.station.mode.bike", language)}</SelectItem>
                  <SelectItem value="walk">{t("settings.station.mode.walk", language)}</SelectItem>
                  <SelectItem value="both">{t("settings.station.mode.both", language)}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        {/*
          Left: what counts on foot (leaving buffer, walking). Right: what counts by bike only.
          Two grid rows, so both "fixed time" fields start at the same height whatever the buffers above need.
        */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border/70 pt-4">
          {/* Tinted tile: the leaving buffer applies to both modes. */}
          <div className="self-start rounded-lg bg-muted/70 p-3">
            <BufferField form={form} name={fields.leaving} label="settings.leaving.buffer" description="settings.leaving.desc" disabled={notRouted} language={language} />
          </div>
          <div className="space-y-4">
            <ModeHeading mode="bike" language={language} />
            <BufferField form={form} name={fields.bike} label="settings.biking.buffer" description="settings.biking.buffer.desc" disabled={bikeFixed} language={language} />
            <BufferField form={form} name={fields.bikeParking} label="settings.bikeParking.buffer" description="settings.bikeParking.buffer.desc" disabled={bikeFixed} language={language} />
          </div>
          <div className="space-y-3">
            <ModeHeading mode="walk" language={language} />
            <FixedTimeField form={form} flag={fields.walkFixed} seconds={fields.walkFixedSeconds} description="settings.fixed.walk.desc" language={language} />
          </div>
          <div className="space-y-3">
            {/* Invisible twin of the "On foot" heading keeps the two fixed-time fields level. */}
            <ModeHeading mode="walk" language={language} hidden />
            <FixedTimeField form={form} flag={fields.bikeFixed} seconds={fields.bikeFixedSeconds} description="settings.fixed.bike.desc" language={language} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModeHeading({ mode, language, hidden = false }: { mode: "walk" | "bike"; language: Language; hidden?: boolean }) {
  const Icon = mode === "walk" ? Footprints : Bike;
  return (
    <p className={`flex items-center gap-2 text-sm font-medium${hidden ? " invisible" : ""}`} aria-hidden={hidden || undefined}>
      <Icon className="w-4 h-4 text-muted-foreground" /> {t(`settings.side.${mode}`, language)}
    </p>
  );
}

type BufferFieldName = (typeof SIDE_FIELDS)["home" | "work"]["leaving" | "bike" | "bikeParking"];

function BufferField({
  form,
  name,
  label,
  description,
  disabled,
  language,
}: {
  form: UseFormReturn<SettingsFormValues>;
  name: BufferFieldName;
  label: string;
  description: string;
  disabled: boolean;
  language: Language;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <LabelWithHelp label={t(label, language)} help={t(description, language)} language={language} />
          <FormControl>
            <MinutesSecondsInput
              value={typeof field.value === "number" ? field.value : undefined}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
              max={MAX_BUFFER_SECONDS}
              // An empty buffer is no buffer: 0 shows as an empty field with the grey "mm:ss" hint.
              emptyMeansZero
              // The form would show the default 0 for an undefined value; NaN keeps the entry and fails validation.
              invalidValue={Number.NaN}
            />
          </FormControl>
          {fieldState.error && !disabled && (
            <p className="text-sm font-medium text-destructive">{t("settings.buffer.invalid", language)}</p>
          )}
        </FormItem>
      )}
    />
  );
}

type FixedFlagName = (typeof SIDE_FIELDS)["home" | "work"]["walkFixed" | "bikeFixed"];
type FixedSecondsName = (typeof SIDE_FIELDS)["home" | "work"]["walkFixedSeconds" | "bikeFixedSeconds"];

/** Checkbox plus mm:ss input; unticking disables the input but keeps its value. */
function FixedTimeField({
  form,
  flag,
  seconds,
  description,
  language,
}: {
  form: UseFormReturn<SettingsFormValues>;
  flag: FixedFlagName;
  seconds: FixedSecondsName;
  description: string;
  language: Language;
}) {
  const enabled = form.watch(flag) === 1;

  return (
    <div className="space-y-2">
      <FormField
        control={form.control}
        name={flag}
        render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormControl>
              <Checkbox
                checked={field.value === 1}
                onCheckedChange={(checked) => {
                  field.onChange(checked ? 1 : 0);
                  // Re-check the time: it is required only while ticked.
                  void form.trigger(seconds);
                }}
              />
            </FormControl>
            <FormLabel className="cursor-pointer font-medium leading-snug">{t("settings.fixed.enable", language)}</FormLabel>
            <HelpHint text={t(description, language)} language={language} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={seconds}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <MinutesSecondsInput
                value={typeof field.value === "number" ? field.value : undefined}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={!enabled}
                max={MAX_FIXED_SECONDS}
              />
            </FormControl>
            {fieldState.error && enabled && (
              <p className="text-sm font-medium text-destructive">{t("settings.fixed.invalid", language)}</p>
            )}
          </FormItem>
        )}
      />
    </div>
  );
}

/**
 * Text input for mm:ss. The only place durations are minutes and seconds: it reports whole seconds to the form, or
 * `invalidValue` while the text is not a valid duration up to `max`. The empty field shows a grey "mm:ss" hint.
 */
function MinutesSecondsInput({
  value,
  onChange,
  onBlur,
  disabled,
  max,
  emptyMeansZero = false,
  invalidValue,
}: {
  value: number | undefined;
  onChange: (seconds: number | undefined) => void;
  onBlur: () => void;
  disabled: boolean;
  max: number;
  /** Empty text stands for 0 seconds, and 0 is shown as an empty field. */
  emptyMeansZero?: boolean;
  invalidValue?: number;
}) {
  const format = (seconds: number | undefined) =>
    seconds === undefined || (emptyMeansZero && seconds === 0) ? "" : formatMinutesSeconds(seconds);
  const parse = (input: string) => (emptyMeansZero && input.trim() === "" ? 0 : parseMinutesSeconds(input, max));
  const [text, setText] = useState(format(value));

  // Follow outside changes (loading saved settings) without overwriting what is being typed.
  useEffect(() => {
    if (value !== undefined && Number.isNaN(value)) return;
    if (value !== parse(text)) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      inputMode="decimal"
      placeholder="mm:ss"
      className={NUMBER_INPUT}
      value={text}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parse(event.target.value) ?? invalidValue);
      }}
      onBlur={() => {
        const parsed = parse(text);
        if (parsed !== undefined) setText(format(parsed));
        onBlur();
      }}
    />
  );
}
