import { useLocation } from "wouter";
import { Train } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { BottomNav } from "@/components/bottom-nav";
import { ErrorBoundary } from "@/components/error-boundary";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { language } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <nav className="border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center px-4 md:px-8 py-3">
          <div className="flex items-center gap-3">
            <Train className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-foreground">{t('app.title', language)}</h1>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-32 w-full max-w-4xl mx-auto">
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
