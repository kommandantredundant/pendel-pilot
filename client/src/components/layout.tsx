import { useLocation } from "wouter";
import { Monitor, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useActiveView } from "@/hooks/use-active-view";
import { BottomNav } from "@/components/bottom-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { TrainIcon } from "@/components/train-icon";
import { InsetDebug, registerInsetDebugTap } from "@/components/inset-debug";

/** Inset diagnostic (5 taps on the title): only in dev and preview builds, never in production. */
const INSET_DEBUG = import.meta.env.DEV || import.meta.env.VITE_PREVIEW === "1";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { language } = useLanguage();
  const { preference, cycle } = useTheme();
  const view = useActiveView();
  // Planner needs the width for its timeline; the settings page keeps the narrow column.
  const wide = view === "plan" && location !== "/settings";
  // Planner grows with the screen: a wider timeline instead of empty margins on large displays.
  const width = wide ? "max-w-none" : "max-w-4xl";
  const ThemeIcon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      {/* Safe-area padding keeps the header clear of the camera cutout and rounded corners
          when the browser draws edge-to-edge (immersive / viewport-fit=cover). */}
      <nav className="border-b border-border/70 sticky top-0 bg-card/95 backdrop-blur z-10 pt-safe-top">
        <div className={cn("flex items-center px-safe-4 md:px-safe-8 py-3 mx-auto w-full", width)}>
          <div className="flex items-center gap-3">
            <TrainIcon className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground select-none" onClick={INSET_DEBUG ? registerInsetDebugTap : undefined}>
              {t('app.title', language)}
              {(view === "glance" || view === "plan") && (
                <span className="ml-1.5 font-mono-numbers text-[0.8em] font-medium uppercase tracking-wide text-primary">
                  {view === "glance" ? "Glance" : "Planner"}
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={cycle}
            className={cn("ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors")}
            aria-label={`${t('theme.label', language)}: ${t(`theme.${preference}`, language)}`}
            title={`${t('theme.label', language)}: ${t(`theme.${preference}`, language)}`}
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      {/* Planner fits the screen above the bottom navigation, so it needs less padding on top. */}
      <main className={cn("flex-1 w-full mx-auto", wide ? "px-safe-8 pt-5 pb-32" : "p-4 px-safe-4 md:p-8 md:px-safe-8 pb-[calc(var(--bottom-nav-space)+1.5rem)] md:pb-[calc(var(--bottom-nav-space)+1.5rem)]", width)}>
        <ErrorBoundary>
          <motion.div
            key={location}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </ErrorBoundary>
        {/* Required by the Transitous usage policy: visible link to its data sources.
            Planner fits the screen and shows the same links in its own bottom line. */}
        {!wide && <DataSources className="mt-8 text-center" />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
      {INSET_DEBUG && <InsetDebug />}
    </div>
  );
}

/** Data source links required by the Transitous usage policy (plus OpenStreetMap attribution). */
export function DataSources({ className }: { className?: string }) {
  const { language } = useLanguage();
  return (
        <p className={cn("text-xs text-muted-foreground", className)}>
          {t('footer.data', language)}{" "}
          <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            {t('footer.sources', language)}
          </a>
          {" "}·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            © {t('footer.osm', language)}
          </a>
        </p>
  );
}
