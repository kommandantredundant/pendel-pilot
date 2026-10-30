## Packages
use-debounce | Required for debouncing the transport station search input to avoid spamming the API
clsx | Utility for conditional class joining (already in stack but needed for custom components)
tailwind-merge | Utility for merging tailwind classes (already in stack)

## Notes
- App uses a dark mode professional aesthetic by default.
- Station search uses a debounced query to /api/transport/stations.
- Relies on date-fns for time formatting of ISO strings.
- Framer Motion used for premium page transitions and list staggering.
