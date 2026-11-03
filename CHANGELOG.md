# Changelog

Publishing a GitHub release deploys that version to Cloudflare Pages (see README, "Release deploys").

## 0.1.1

- **Planner:** the desktop planning view is now called Planner (title bar "Pendel-Pilot PLANNER", settings card "Planner"). Saved settings carry over unchanged.
- **App icon:** a high-speed train in side view, heading right, in white on the brand blue. It is used in the title bar, as the browser tab icon, and as the home-screen icon. A web app manifest makes the app installable with its own name, icon and colours.
- **Clearer addresses:** `/towork`, `/tohome` and `/settings` replace `/`, `/andback` and `/how`. `/` opens `/towork`, and the old addresses redirect, so existing bookmarks and home-screen links keep working.
- **Train symbol:** the same train replaces the tram symbol in line pills, empty states and error messages.
- **CI:** the GitHub Actions workflows use `actions/checkout` and `actions/setup-node` v5 (Node 24).

## 0.1.0

First release deployed to Cloudflare Pages: classic dashboards for both directions, Glance (mobile countdown), Planner (desktop timeline), walk and bike times at both ends, every leg with track and real-time departure, dark mode, and German and English.
