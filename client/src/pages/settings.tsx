import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, MapPin, Footprints, Bike, Loader2, Zap, Route, AlertCircle, Eye, CalendarRange } from "lucide-react";
import { useLocation } from "wouter";
import { insertSettingsSchema } from "@shared/client-schema";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { StationSearch } from "@/components/station-search";
import { ErrorDisplay } from "@/components/error-display";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";
import { isStorageAvailable } from "@/lib/settings-storage";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Using z.coerce.number for form numeric inputs to fix types
const formSchema = insertSettingsSchema.extend({
  walkBufferMinutes: z.coerce.number().min(0).max(60),
  bikeBufferMinutes: z.coerce.number().min(0).max(60),
  homeLeavingBufferMinutes: z.coerce.number().min(0).max(60),
  workLeavingBufferMinutes: z.coerce.number().min(0).max(60),
  excludeFernverkehr: z.coerce.number().min(0).max(1),
  glanceMode: z.coerce.number().min(0).max(1),
  planMode: z.coerce.number().min(0).max(1),
  stationModeFromHome: z.enum(["walk", "bike", "both"]),
  stationModeFromWork: z.enum(["walk", "bike", "both"]),
  language: z.enum(["en", "de"]).default("en"),
});

type SettingsFormValues = z.infer<typeof formSchema>;

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { language, setLanguage } = useLanguage();
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateSettings();
  const storageAvailable = isStorageAvailable();
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [routingError, setRoutingError] = useState<Error | unknown>(null);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      homeAddress: "",
      homeStationId: "",
      homeStationName: "",
      workAddress: "",
      workStationId: "",
      workStationName: "",
      walkBufferMinutes: 0,
      bikeBufferMinutes: 0,
      homeLeavingBufferMinutes: 0,
      workLeavingBufferMinutes: 0,
      excludeFernverkehr: 0,
      glanceMode: 0,
      planMode: 0,
      stationModeFromHome: "both",
      stationModeFromWork: "both",
      language: "en",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
      setLanguage((settings.language as Language) || "en");
    }
    // Only sync from DB on initial settings load, not on every language change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const onSubmit = (data: SettingsFormValues) => {
    setIsCalculatingRoutes(true);
    setRoutingError(null);

    updateSettings(data, {
      onSuccess: () => {
        setIsCalculatingRoutes(false);
        setRoutingError(null);
        // Only redirect if they didn't have settings before (first setup)
        if (!settings) {
          setLocation("/");
        }
      },
      onError: (error) => {
        setIsCalculatingRoutes(false);
        setRoutingError(error);
      }
    });
  };

  const handleRecalculateRoutes = () => {
    const currentValues = form.getValues();
    setIsRecalculating(true);
    setRoutingError(null);

    updateSettings(currentValues, {
      onSuccess: () => {
        setIsRecalculating(false);
        setRoutingError(null);
      },
      onError: (error) => {
        setIsRecalculating(false);
        setRoutingError(error);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg bg-card" />
        <Skeleton className="h-[400px] w-full rounded-2xl bg-card" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {!storageAvailable && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t('settings.storage.disabled', language)}
        </div>
      )}

      {isCalculatingRoutes && (
        <Alert className="mb-4 border-border/70 bg-card">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <AlertDescription className="text-muted-foreground">
            {t('settings.routes.calculating', language)}
          </AlertDescription>
        </Alert>
      )}

      {!!routingError && (
        <ErrorDisplay
          error={routingError}
          language={language}
          showFixAction={false}
        />
      )}

      {settings && settings.routingCalculatedAt && (
        <Alert className="mb-4 border-border/70 bg-card">
          <Route className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground text-xs flex items-center justify-between gap-3">
            <span>{t('settings.routes.calculated', language)} {new Date(settings.routingCalculatedAt).toLocaleString()}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecalculateRoutes}
              disabled={isRecalculating || isUpdating}
              className="shrink-0"
            >
              {isRecalculating ? (
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
      <div className="sticky top-12 z-10 flex items-center justify-between mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 -mx-2 px-2">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('settings.title', language)}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(val) => { const lang = val as Language; setLanguage(lang); form.setValue('language', lang); }}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('language.en', language)}</SelectItem>
              <SelectItem value="de">{t('language.de', language)}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            form="settings-form"
            size="sm"
            disabled={isUpdating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground border-transparent"
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" /> {isCalculatingRoutes ? t('settings.routes.calculating', language) : t('settings.saving', language)}
              </>
            ) : (
              <>
                <Save className="mr-2 w-4 h-4" /> {t('settings.save', language)}
              </>
            )}
          </Button>
        </div>
      </div>

      <Form {...form}>
        {/* The save button lives in the sticky header, outside this element; it targets the form by id. */}
        <form id="settings-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          
          {/* Home Settings Card */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="w-4 h-4 text-muted-foreground" /> {t('settings.home', language)}
              </CardTitle>
              <CardDescription>{t('settings.home.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="homeAddress"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.home.address', language)}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('settings.home.address.placeholder', language)} className="h-10 rounded-lg bg-card" {...field} />
                      </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="homeStationId"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.home.station', language)}</FormLabel>
                      <FormControl>
                        <StationSearch
                          value={field.value}
                          stationName={form.watch("homeStationName")}
                          onChange={(id, name, location) => {
                            field.onChange(id);
                            form.setValue("homeStationName", name, { shouldValidate: true });
                            form.setValue("homeStationLat", location?.latitude);
                            form.setValue("homeStationLon", location?.longitude);
                          }}
                          placeholder={t('station.search.placeholder', language)}
                        />
                      </FormControl>
                      <FormDescription>{t('settings.home.station.desc', language)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="homeLeavingBufferMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.leaving.buffer', language)}</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" max="60" className="h-10 rounded-lg bg-card font-mono-numbers max-w-[8rem]" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">{t('settings.leaving.desc', language)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Work Settings Card */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="w-4 h-4 text-muted-foreground" /> {t('settings.work', language)}
              </CardTitle>
              <CardDescription>{t('settings.work.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="workAddress"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.work.address', language)}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('settings.work.address.placeholder', language)} className="h-10 rounded-lg bg-card" {...field} />
                      </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workStationId"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.work.station', language)}</FormLabel>
                      <FormControl>
                        <StationSearch
                          value={field.value}
                          stationName={form.watch("workStationName")}
                          onChange={(id, name, location) => {
                            field.onChange(id);
                            form.setValue("workStationName", name, { shouldValidate: true });
                            form.setValue("workStationLat", location?.latitude);
                            form.setValue("workStationLon", location?.longitude);
                          }}
                          placeholder={t('station.search.placeholder', language)}
                        />
                      </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workLeavingBufferMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.leaving.buffer', language)}</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" max="60" className="h-10 rounded-lg bg-card font-mono-numbers max-w-[8rem]" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">{t('settings.leaving.desc', language)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Speed Profile */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Footprints className="w-4 h-4 text-muted-foreground" /> {t('settings.speed', language)}
              </CardTitle>
              <CardDescription>{t('settings.speed.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="walkBufferMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.walking.buffer', language)}</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" className="h-10 rounded-lg bg-card font-mono-numbers max-w-[8rem]" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">{t('settings.walking.buffer.desc', language)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bikeBufferMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.biking.buffer', language)}</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" className="h-10 rounded-lg bg-card font-mono-numbers max-w-[8rem]" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">{t('settings.biking.buffer.desc', language)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('settings.station.mode', language)}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["stationModeFromHome", "stationModeFromWork"] as const).map((name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs text-muted-foreground">
                            {t(name === "stationModeFromHome" ? 'settings.station.mode.fromHome' : 'settings.station.mode.fromWork', language)}
                          </FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="h-10 rounded-lg bg-card">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bike">{t('settings.station.mode.bike', language)}</SelectItem>
                              <SelectItem value="walk">{t('settings.station.mode.walk', language)}</SelectItem>
                              <SelectItem value="both">{t('settings.station.mode.both', language)}</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.station.mode.desc', language)}</p>
              </div>
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

          {/* Glance view */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="w-4 h-4 text-muted-foreground" /> Glance
              </CardTitle>
              <CardDescription>{t('settings.glance.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="glanceMode"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value === 1}
                        onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                      />
                    </FormControl>
                    <div className="flex-1">
                      <FormLabel className="cursor-pointer font-medium">{t('settings.glance.enable', language)}</FormLabel>
                      <FormDescription>{t('settings.glance.enable.desc', language)}</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Plan view (desktop) */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="w-4 h-4 text-muted-foreground" /> Plan
              </CardTitle>
              <CardDescription>{t('settings.plan.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="planMode"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value === 1}
                        onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                      />
                    </FormControl>
                    <div className="flex-1">
                      <FormLabel className="cursor-pointer font-medium">{t('settings.plan.enable', language)}</FormLabel>
                      <FormDescription>{t('settings.plan.enable.desc', language)}</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

        </form>
      </Form>
    </div>
  );
}
