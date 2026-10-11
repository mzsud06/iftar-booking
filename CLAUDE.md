# Notes for Claude Code

- Next.js 16 (App Router, `proxy.ts` not `middleware.ts`, async request APIs). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- All pages are client components that call Supabase directly with the public key. Every rule lives in Postgres functions in `supabase/migrations/0001_schema.sql`. Never put rules only in the frontend.
- Change the database with a new migration file, not by editing old ones once they're applied.
- Times: store `timestamptz`, show times in Europe/London using `src/lib/time.ts`.
- Use the server clock (`useServerNow`) for anything time-based in the UI, never the phone clock alone.
- Design: crimson `#6e0f1d`, gold `#c9a04a`, ivory `#fbf7f0`; Cormorant Garamond headings, Inter body. Minimal text, square corners, no boxed cards (use gold rules and lines). Reuse components in `src/components/ui.tsx`.
- The owner is on Windows: give PowerShell-friendly commands.
