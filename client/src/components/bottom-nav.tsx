import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Home, Briefcase, Settings } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";

interface NavItem {
  path: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  ariaLabel: string;
}

const navItems: NavItem[] = [
  { path: "/tohome", labelKey: "nav.home", icon: Home, ariaLabel: "Home" },
  { path: "/towork", labelKey: "nav.work", icon: Briefcase, ariaLabel: "Work" },
  { path: "/settings", labelKey: "nav.settings", icon: Settings, ariaLabel: "Settings" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const baselineHeight = useRef(window.innerHeight);
  const navRef = useRef<HTMLElement>(null);

  // Publish how much of the viewport bottom the nav covers (incl. safe area and the floating
  // offset on desktop), so sticky elements and the page padding can sit right above it.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const update = () => {
      const space = Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().top));
      root.style.setProperty("--bottom-nav-space", `${space}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    window.addEventListener("resize", update);
    nav.addEventListener("transitionend", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      nav.removeEventListener("transitionend", update);
      root.style.removeProperty("--bottom-nav-space");
    };
  }, []);

  // Detect virtual keyboard visibility
  useEffect(() => {

    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        setIsInputFocused(false);
        // Update baseline when input loses focus
        baselineHeight.current = window.innerHeight;
      }
    };

    const handleResize = () => {
      const currentViewportHeight = window.innerHeight;
      const heightDifference = baselineHeight.current - currentViewportHeight;

      if (isInputFocused && heightDifference > 150) {
        // Keyboard is visible when input is focused AND viewport decreased significantly
        setIsKeyboardVisible(true);
      } else if (!isInputFocused) {
        // Update baseline when no input is focused
        baselineHeight.current = currentViewportHeight;
        setIsKeyboardVisible(false);
      } else {
        // Input focused but no significant height change
        setIsKeyboardVisible(false);
      }
    };

    // Listen for focus/blur events on input elements
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Get current path without query parameters for active state comparison
  const currentPath = location.split("?")[0];

  // Preserve query parameters when navigating
  const getHref = (basePath: string) => {
    const queryParams = location.split("?")[1];
    return queryParams ? `${basePath}?${queryParams}` : basePath;
  };

  return (
    <nav
      ref={navRef}
      className={`
        fixed bottom-0 left-0 right-0 z-50
        backdrop-blur-lg bg-card/95
        border-t border-border/70
        transition-transform duration-300 ease-in-out
        ${isKeyboardVisible ? "translate-y-full" : "translate-y-0"}
        md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto md:min-w-[400px]
        md:rounded-2xl md:border md:shadow-lg
      `}
      role="navigation"
      aria-label="Main navigation"
      data-bottom-nav
    >
      {/* Bottom padding grows into the safe area (gesture bar / home indicator) instead of adding to it. */}
      <div className="flex items-center justify-around px-[max(0.5rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-1 pb-safe-nav md:py-3">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={getHref(item.path)}
              className={`
                flex flex-col items-center justify-center
                min-w-[64px] px-3 py-1.5 md:py-2 rounded-xl
                transition-all duration-200 ease-in-out
                ${isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
                focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                focus:ring-offset-background
              `}
              aria-label={item.ariaLabel}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={`
                  w-5 h-5 md:w-6 md:h-6
                  transition-transform duration-200
                  ${isActive ? "scale-110" : "scale-100"}
                `}
                aria-hidden="true"
              />
              <span
                className={`
                  text-[10px] md:text-xs font-medium mt-1
                  transition-all duration-200
                  ${isActive ? "font-semibold" : "font-normal"}
                `}
              >
                {t(item.labelKey, language)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

