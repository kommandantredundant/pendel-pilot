# Changelog

Publishing a GitHub release deploys that version to Cloudflare Pages (see README, "Releases and deployment").

## 0.1.3

- **Planner on large screens:** Planner now uses the full window width instead of stopping at 1536 px, so the timeline grows with the display. Taller windows show more connections: 6 on a 13" laptop, up to 12 on large screens.
- **Finer time axis:** small marks every 10 minutes between the labelled half hours.
- **Walk above bike:** with both modes shown, the walk lane sits above the bike lane, and leave, arrive and duration list walking first, since you leave earlier on foot.
- **One request less on load:** the dashboards wait for the saved settings before choosing a view, so opening Planner or Glance no longer fires a request for the classic view first.

## 0.1.2

- **Saving with address lookup problems:** if the address lookup (Photon) fails or times out, the app now retries once and looks up home and work one after the other instead of at the same time. If it still fails, the message explains what went wrong in plain language and names the technical cause (for example "photon responded with HTTP 403."), instead of showing "geocoding-network".
- **Honest save feedback:** "Settings saved" now appears only once the addresses are found and the profile is stored. Before, it showed immediately, and on first setup the app moved on to the dashboard even if saving failed in the background.
- **Clear API errors:** when Photon or Transitous fail, address and station search answer with a reason (503, or 504 on timeout) instead of a bare 500, and the cause is logged for Cloudflare.

## 0.1.1

- **Planner:** the desktop planning view is now called Planner (title bar "Pendel-Pilot PLANNER", settings card "Planner"). Saved settings carry over unchanged.
- **App icon:** a high-speed train in side view, heading right, in white on the brand blue. It is used in the title bar, as the browser tab icon, and as the home-screen icon. A web app manifest makes the app installable with its own name, icon and colours.
- **Clearer addresses:** `/towork`, `/tohome` and `/settings` replace `/`, `/andback` and `/how`. `/` opens `/towork`, and the old addresses redirect, so existing bookmarks and home-screen links keep working.
- **Train symbol:** the same train replaces the tram symbol in line pills, empty states and error messages.
- **CI:** the GitHub Actions workflows use `actions/checkout` and `actions/setup-node` v5 (Node 24).

## 0.1.0

First release deployed to Cloudflare Pages: classic dashboards for both directions, Glance (mobile countdown), Planner (desktop timeline), walk and bike times at both ends, every leg with track and real-time departure, dark mode, and German and English.
