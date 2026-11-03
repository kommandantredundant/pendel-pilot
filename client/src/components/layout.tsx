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
  // 1536 px: on a 13" laptop (1440 px) Planner uses the full width, larger screens keep it readable.
  const width = wide ? "max-w-screen-2xl" : "max-w-4xl";
  const ThemeIcon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <nav className="border-b border-border/70 sticky top-0 bg-card/95 backdrop-blur z-10">
        <div className={cn("flex items-center px-4 md:px-8 py-3 mx-auto w-full", width)}>
          <div className="flex items-center gap-3">
            <TrainIcon className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">
              {t('app.title', language)}
              {view !== "classic" && (
                <span className="ml-1.5 font-mono-numbers text-[0.8em] font-medium uppercase tracking-wide text-primary">
                  {view === "glance" ? "Glance" : "Planner"}
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={cycle}
            className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={`${t('theme.label', language)}: ${t(`theme.${preference}`, language)}`}
            title={`${t('theme.label', language)}: ${t(`theme.${preference}`, language)}`}
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={cn("flex-1 p-4 md:p-8 pb-24 md:pb-32 w-full mx-auto", width)}>
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
        {/* Required by the Transitous usage policy: visible link to its data sources. */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t('footer.data', language)}{" "}
          <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            {t('footer.sources', language)}
          </a>
          {" "}·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            © OpenStreetMap
          </a>
        </p>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
