import { Link } from "wouter";
import {
  ArrowRight,
  Bike,
  Check,
  ExternalLink,
  GanttChart,
  Github,
  Lock,
  Radio,
  Smartphone,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSources } from "@/components/layout";
import { TrainIcon } from "@/components/train-icon";
import { useSettings } from "@/hooks/use-settings";
import { useLanguage } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";

const GITHUB_URL = "https://github.com/kommandantredundant/pendel-pilot";

const FEATURES = [
  { key: "modes", icon: Bike },
  { key: "realtime", icon: Radio },
  { key: "glance", icon: Timer },
  { key: "planner", icon: GanttChart },
  { key: "private", icon: Lock },
  { key: "app", icon: Smartphone },
] as const;

const OPEN_SOURCE_APPS = [
  { name: "Transportr", url: "https://transportr.app", key: "transportr" },
  { name: "KDE Itinerary", url: "https://apps.kde.org/itinerary/", key: "itinerary" },
  { name: "bahn.expert", url: "https://bahn.expert", key: "bahnexpert" },
] as const;

/** `/`: explains the app to new visitors and leads them to the settings to set up their commute. */
export default function LandingPage() {
  const { language } = useLanguage();
  const { data: settings } = useSettings();
  const configured = !!settings;
  const l = (key: string) => t(`landing.${key}`, language);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/95 pt-safe-top">
        <div className="max-w-4xl mx-auto px-safe-4 md:px-safe-8 py-3 flex items-center gap-3">
          <TrainIcon className="w-5 h-5 text-primary" />
          <span className="font-semibold">{t("app.title", language)}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-safe-4 md:px-safe-8 pb-safe-bottom">
        {/* Hero */}
        <section className="py-12 md:py-20">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{l("hero.title")}</h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl">{l("hero.lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={configured ? "/towork" : "/settings"}>
                {l(configured ? "cta.open" : "cta.setup")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            {configured && (
              <Button asChild size="lg" variant="outline">
                <Link href="/settings">{l("cta.settings")}</Link>
              </Button>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{l("hero.note")}</p>
        </section>

        {/* Who it is for */}
        <Section title={l("for.title")}>
          <ul className="space-y-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <ListItem key={n} icon="check">{l(`for.${n}`)}</ListItem>
            ))}
          </ul>
        </Section>

        {/* Features */}
        <Section title={l("features.title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => (
              <div key={key} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                  {l(`features.${key}.title`)}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{l(`features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* What to expect and what not */}
        <Section title={l("expect.title")}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold mb-3">{l("expect.yes.title")}</h3>
              <ul className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <ListItem key={n} icon="check">{l(`expect.yes.${n}`)}</ListItem>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">{l("expect.no.title")}</h3>
              <ul className="space-y-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <ListItem key={n} icon="x">{l(`expect.no.${n}`)}</ListItem>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* Who it is not for, and what to use instead */}
        <Section title={l("notfor.title")}>
          <p className="text-muted-foreground mb-5">{l("notfor.lead")}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <AlternativeCard title={l("notfor.operators.title")}>
              <p>{l("notfor.operators.desc")}</p>
              <p className="mt-2">{l("notfor.operators.list")}</p>
            </AlternativeCard>
            <AlternativeCard title={l("notfor.opensource.title")}>
              <ul className="space-y-2">
                {OPEN_SOURCE_APPS.map((app) => (
                  <li key={app.key}>
                    <ExternalAnchor href={app.url}>{app.name}</ExternalAnchor>
                    {" – "}
                    {l(`notfor.opensource.${app.key}`)}
                  </li>
                ))}
              </ul>
            </AlternativeCard>
            <AlternativeCard title={l("notfor.transitous.title")}>
              <p>
                <ExternalAnchor href="https://transitous.org">transitous.org</ExternalAnchor>
                {" – "}
                {l("notfor.transitous.desc")}
              </p>
            </AlternativeCard>
          </div>
        </Section>

        <DevSection language={language} />
      </main>

      <footer className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <DataSources className="text-center" />
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-8 md:py-10 border-t border-border/70">
      <h2 className="text-2xl font-bold tracking-tight mb-5">{title}</h2>
      {children}
    </section>
  );
}

function ListItem({ icon, children }: { icon: "check" | "x"; children: React.ReactNode }) {
  const Icon = icon === "check" ? Check : X;
  return (
    <li className="flex gap-3">
      <Icon
        className={icon === "check" ? "w-5 h-5 shrink-0 mt-0.5 text-primary" : "w-5 h-5 shrink-0 mt-0.5 text-muted-foreground"}
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

function AlternativeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <h3 className="font-semibold text-base text-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-foreground underline hover:text-primary">
      {children}
    </a>
  );
}

/** Small section for developers at the bottom, leading to the repository. */
function DevSection({ language }: { language: Language }) {
  return (
    <section className="py-6 border-t border-border/70 text-sm text-muted-foreground">
      <h2 className="font-semibold text-foreground mb-1">{t("landing.dev.title", language)}</h2>
      <p>
        {t("landing.dev.desc", language)}{" "}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline hover:text-foreground">
          <Github className="w-4 h-4" aria-hidden="true" />
          {t("landing.dev.link", language)}
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}
