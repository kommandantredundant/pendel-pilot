# Changelog

Publishing a GitHub release deploys that version to Cloudflare Pages (see README, "Releases and deployment").

## Unreleased

- **Start page:** `/` now explains Pendel-Pilot: who it is for, what it does and what not, and which apps suit you better for tickets, disruption alerts or changing destinations (operator apps, open-source apps, Transitous). It leads you to the settings to set up your commute, or straight to your commute once it is set up. A short section at the bottom points developers to GitHub.
- **Home-screen app opens your commute:** the installed web app starts at `/towork` instead of `/`.
- **OpenStreetMap attribution:** the footer now credits "© OpenStreetMap contributors" (German: "© OpenStreetMap-Mitwirkende"), as OpenStreetMap asks.
- **Browser language:** until you choose a language in the settings, the app uses your browser's language (German or English) instead of always starting in English.

## 0.1.5

- **Planner fits the screen:** Planner shows exactly as many connections as fit without scrolling, measured on the actual page. Paging, legend, keyboard shortcuts and the data source links always stay visible at the bottom; use Earlier/Later to see more.
- **More room on desktop:** Planner's header is a single line and the rows are more compact, so more connections fit above the bottom navigation.
- **Fixed jumbled timelines:** when several connections shared their first train, rows could show stale timelines at the wrong position. Each connection now has its own identity.
- **Alternatives sorted sensibly:** connections that start with the same train (for example RE1 → ICE 108 and RE1 → RB89) are all listed; the one that arrives earlier comes first. Exact duplicates are shown once.
- **Clearer grid:** the half-hour lines and the 10-minute lines in the timeline are drawn darker, so they stay visible on white and in dark mode.
- **Continuous "now" line:** the red line for the current time runs through the whole timeline, from the time axis down to the last row, instead of one short mark per row.
- **Missed connection stays on top:** the one just-missed connection in "Now" always comes first.

## 0.1.4

- **"Now" means leaving now:** Planner's "Now" view lists the connections you can still make on foot or by bike, including those that need you to hurry, and above them at most the one you just missed. Trains you would have had to leave for already no longer fill the list.
- **Same in the classic view:** its "Now" list also shows only connections you can still make with your usual way to the station (both ways when set to spontaneous), plus the one just missed. Glance gets the same top-up, so it finds the next reachable connection more often.
- **Topped up automatically:** when "now" connections fall out of reach, Planner loads further ones in the background, so the list stays full.
- **Earlier/Later from what you see:** paging continues right after (or before) the rows on screen.

## 0.1.3

- **Planner on large screens:** Planner now uses the full window width instead of stopping at 1536 px, so the timeline grows with the display. Taller windows show more connections: 6 on a 13" laptop, up to 12 on large screens.
- **Finer time axis:** small marks every 10 minutes between the labelled half hours.
- **Calmer rows:** the "Fastest" and "Fewest" badges are gone; duration and transfers stand on their own, and the narrower transfers column leaves more room for the timeline.
- **Short ways stay readable:** when the way to or from the station is too short for its icon, the icon sits just outside the bar (before the way to the station, after the way from it) in a colour readable on the row background, instead of being cut off.
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
