# Migrate to TanStack Start

The project is still fully on the Classic stack (Vite + React Router 6, React 18). The earlier attempt never wrote any files, so this runs from the beginning using the built-in migration procedure.

## What happens

1. **Preflight** — confirm the project is eligible and that it builds cleanly as-is.
2. **Scan** — inventory routes, providers, theme tokens, `index.html` head tags, `main.tsx` init code, and backend functions, then post a summary.
3. **Framework swap** — new config files, router/server entry points, and `src/styles.css`, with your custom wine theme tokens re-applied on top.
4. **Dependencies** — merge in the TanStack package set, keeping your own dependencies and scripts.
5. **Routes** — generate one file per route under `src/routes/` for `/`, `/auth`, `/cellar`, `/add`, `/wine/$id`, `/upload-logo`, `/wishlist`, `/profile`, plus a root shell carrying the providers, toasters, favicon, and title.
6. **Imports** — route existing `react-router-dom` calls through a compatibility layer so pages keep working unchanged.
7. **Backend functions** — classify the four wine-processing functions; only ones called solely from the app move over, the rest stay exactly where they are.
8. **Verify** — clean install, production build, full typecheck, and a live page-load check on every route before switching the publishing pipeline.

## Notes

- Your live site keeps serving the current version until you publish.
- The whole migration lands in this one chat turn, so you can revert it from chat history if anything looks wrong.
- Visual regressions are the main risk (theme tokens and Tailwind v4 class renames); I re-apply the burgundy/champagne palette explicitly and sweep for renamed utilities.
- No database or storage changes.
