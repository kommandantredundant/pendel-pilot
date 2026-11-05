import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Loader2, Zap, Route, Eye, CalendarRange } from "lucide-react";
import { useLocation } from "wouter";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { SettingsSideSection } from "@/components/settings-side-section";
import { ErrorDisplay } from "@/components/error-display";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";
import { isStorageAvailable } from "@/lib/settings-storage";
import { settingsFormSchema, type SettingsFormValues } from "@/lib/settings-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      homeAddress: "",
      homeStationId: "",
      homeStationName: "",
      workAddress: "",
      workStationId: "",
      workStationName: "",
      homeLeavingBufferMinutes: 0,
      workLeavingBufferMinutes: 0,
      homeBikeBufferMinutes: 0,
      workBikeBufferMinutes: 0,
      homeBikeParkingMinutes: 0,
      workBikeParkingMinutes: 0,
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

  useEffect(() => {
    if (settings) {
      form.reset(settings);
      setLanguage((settings.language as Language) || language);
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
          setLocation("/towork");
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
          
          <SettingsSideSection side="home" form={form} language={language} />
          <SettingsSideSection side="work" form={form} language={language} />

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

          {/* Planner view (desktop) */}
          <Card className="bg-card border-border/70 shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="w-4 h-4 text-muted-foreground" /> Planner
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
