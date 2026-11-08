import { useEffect, useState } from "react";

/**
 * Temporary diagnostic for edge-to-edge layouts: open any page with `?debug=insets`
 * to see the safe-area insets and viewport sizes the browser reports.
 * Remove before the next release.
 */
export function InsetDebug() {
  const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "insets";
  const [info, setInfo] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
    const modes = ["fullscreen", "standalone", "minimal-ui", "browser"];
    const update = () => {
      const cs = getComputedStyle(probe);
      const vv = window.visualViewport;
      setInfo([
        `safe top ${cs.paddingTop} · bottom ${cs.paddingBottom}`,
        `safe left ${cs.paddingLeft} · right ${cs.paddingRight}`,
        `inner ${window.innerWidth}×${window.innerHeight}`,
        `visual ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : "–"}`,
        `screen ${screen.width}×${screen.height} · dpr ${window.devicePixelRatio}`,
        `display-mode ${modes.find((m) => matchMedia(`(display-mode: ${m})`).matches) ?? "?"}`,
        `nav space ${getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-space")}`,
        navigator.userAgent,
      ]);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      probe.remove();
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="fixed left-1/2 top-1/3 -translate-x-1/2 z-[100] w-[90vw] max-w-sm rounded-lg bg-black/85 text-white text-[11px] font-mono p-3 space-y-0.5 pointer-events-none">
      {info.map((line, i) => (
        <div key={i} className="break-all">{line}</div>
      ))}
    </div>
  );
}
