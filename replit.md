# The Mirage

A product standardizer tool that scrapes e-commerce URLs and uses Gemini AI to generate premium, standardized Shopify listings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Tailwind v4, Framer Motion, @google/genai)
- API: Express 5 (Puppeteer for scraping, Cheerio for parsing)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/the-mirage/` — React + Vite frontend (the main UI)
- `artifacts/api-server/` — Express API server
  - `src/routes/scrape.ts` — POST /api/scrape (Puppeteer scraping), GET /api/proxy-image
  - `src/routes/health.ts` — GET /api/healthz
- `artifacts/the-mirage/src/App.tsx` — the entire Mirage app UI (~1250 lines)
- `artifacts/the-mirage/src/index.css` — Tailwind v4 theme with Mirage colors/fonts

## Architecture decisions

- All AI calls (Gemini) happen client-side in the browser — API key is passed via `VITE_GEMINI_API_KEY` env var, with built-in fallback keys.
- Scraping runs server-side via Puppeteer in the Express API, to avoid CORS issues.
- Image proxying (`/api/proxy-image`) runs through the API server to allow cross-origin downloads.
- The app stores processing history in `localStorage` (no database needed).
- Single-page app with no routing — the entire app lives in `App.tsx`.

## Product

Users paste an e-commerce product URL and a cost price. The Mirage scrapes the product page, extracts images/title/description/price, then uses Gemini AI to generate a standardized Shopify-ready product listing with proper title, description, tags, pricing (with markup), and CSV export.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `VITE_GEMINI_API_KEY` env var is used for the frontend AI calls (not `GEMINI_API_KEY`)
- The API server bundles Puppeteer — builds are large (~3.6mb) but this is expected
- Puppeteer needs `--no-sandbox` flags in the Replit environment

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
