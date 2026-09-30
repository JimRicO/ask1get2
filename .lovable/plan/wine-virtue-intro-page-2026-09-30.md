# Wine & Virtue intro page

## What gets built
- New page at `/intro` that plays the existing intro film (`/wine-and-virtue-intro.html`) full screen.
- "Skip intro" pill button in the top-right corner. It goes to the app home.
- When the film sends its "wv-intro-ended" signal, the page goes to the app home automatically.
- First visit only: skipping or finishing marks the intro as seen on this device. Later visits to `/intro` go straight to home.
- A "Watch the intro" link on the Profile screen opens the intro again, even if it was already seen.

## Notes
- "App home" is `/`, which currently forwards to the login page (and on to the Cellar when signed in).
- Nothing else is changed, so first-time visitors only see the intro if they open `/intro` (or a link to it). Sending new visitors there automatically would mean changing the home page, which you asked me not to touch.

## Technical details
- `src/routes/intro.tsx`:
  - `ssr: false`. `beforeLoad` reads `localStorage["wv-intro-seen"]`. When it is set and the search does not include `?replay=1`, redirect to `/`.
  - Iframe: `src="/wine-and-virtue-intro.html"`, `allow="autoplay"`, no border, `width: 100%`, `height: 100dvh`, background `#140B0C`, `display: block`.
  - Skip button: absolutely positioned top-right. IBM Plex Mono (already loaded), 11px, uppercase, color `#F4ECE1`, background `#1D1213` at about 70% opacity, 1px `#3B2729` border, `rounded-full`. It calls `finish()`.
  - `useEffect` adds a `message` listener. When `event.data === "wv-intro-ended"`, it calls `finish()`. The listener is removed on unmount.
  - `finish()` sets `wv-intro-seen = "1"`, then `navigate({ to: "/", replace: true })`.
  - Adds `head()` with its own title, description, og:title, og:description, og:type, and twitter:card.
  - `validateSearch` accepts an optional `replay` boolean.
- `src/pages/Profile.tsx`: adds one "Watch the intro" `Link` to `/intro?replay=1`. Nothing else changes.
- The exact colors are given as literal values, per the request.
