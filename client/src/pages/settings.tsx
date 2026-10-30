import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, MapPin, Footprints, Bike, Loader2, Zap, Route, AlertCircle } from "lucide-react";
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
        <Alert className="mb-4 border-blue-500/50 bg-blue-500/10">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <AlertDescription className="text-blue-500">
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
        <Alert className="mb-4 border-emerald-500/50 bg-emerald-500/10">
          <Route className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-500 flex items-center justify-between">
            <span>{t('settings.routes.calculated', language)} {new Date(settings.routingCalculatedAt).toLocaleString()}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecalculateRoutes}
              disabled={isRecalculating || isUpdating}
              className="ml-4 border-emerald-500/50 hover:bg-emerald-500/20"
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
      <div className="sticky top-0 z-10 flex items-center justify-between mb-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 -mx-2 px-2">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-semibold">{t('settings.title', language)}</h1>
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
        <form id="settings-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* Home Settings Card */}
          <Card className="glass-panel border-border/50 shadow-lg rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
            <CardHeader className="bg-secondary/30 pb-4">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" /> {t('settings.home', language)}
              </CardTitle>
              <CardDescription>{t('settings.home.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <FormField
                control={form.control}
                name="homeAddress"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.home.address', language)}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('settings.home.address.placeholder', language)} className="h-12 rounded-xl bg-background/50 border-border/50 focus-visible:ring-blue-500" {...field} />
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
                          onChange={(id, name) => {
                            field.onChange(id);
                            form.setValue("homeStationName", name, { shouldValidate: true });
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
                      <Input type="number" step="1" min="0" max="60" className="h-12 rounded-xl bg-background/50 font-mono-numbers" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">{t('settings.leaving.desc', language)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Work Settings Card */}
          <Card className="glass-panel border-border/50 shadow-lg rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
            <CardHeader className="bg-secondary/30 pb-4">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-500" /> {t('settings.work', language)}
              </CardTitle>
              <CardDescription>{t('settings.work.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <FormField
                control={form.control}
                name="workAddress"
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t('settings.work.address', language)}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('settings.work.address.placeholder', language)} className="h-12 rounded-xl bg-background/50 border-border/50 focus-visible:ring-emerald-500" {...field} />
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
                          onChange={(id, name) => {
                            field.onChange(id);
                            form.setValue("workStationName", name, { shouldValidate: true });
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
                      <Input type="number" step="1" min="0" max="60" className="h-12 rounded-xl bg-background/50 font-mono-numbers" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">{t('settings.leaving.desc', language)}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Speed Profile */}
          <Card className="glass-panel border-border/50 shadow-lg rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
            <CardHeader className="bg-secondary/30 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Footprints className="w-5 h-5 text-amber-500" /> {t('settings.speed', language)}
              </CardTitle>
              <CardDescription>{t('settings.speed.desc', language)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="walkBufferMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.walking.buffer', language)}</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" className="h-12 rounded-xl bg-background/50 font-mono-numbers" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">{t('settings.walking.buffer.desc', language)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="bikeBufferMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.biking.buffer', language)}</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" className="h-12 rounded-xl bg-background/50 font-mono-numbers" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">{t('settings.biking.buffer.desc', language)}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Train Preferences */}
          <Card className="border border-border rounded">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" /> {t('settings.trains', language)}
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

        </form>
      </Form>
    </div>
  );
}
