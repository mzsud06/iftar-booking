# KCL ISoc Iftars

Booking site for the KCL ISoc Ramadan iftars. People book a free spot from 6am the day before,
get a QR ticket, and volunteers scan it at the door. No-shows get strikes; two strikes block the next booking.

Built with Next.js, Supabase and Vercel.

## How it fits together

- `src/app` — the pages: home, login, setup, ticket, rules, scan (volunteers), admin.
- `supabase/migrations/0001_schema.sql` — the whole database: tables, security rules and every
  booking rule (capacity, waitlist offers, cancels, check-ins, strikes, bans, auto-close).
  The website only ever calls these database functions, so the rules can't be bypassed from the browser.

## Running it locally

```
npm install
cp .env.example .env.local
npm run dev
```

## Roles

- The first admin is set in the `admin_emails` table. Log in with that email and you're an admin.
- Make other people volunteers or admins from Admin → People.

## Timed jobs (run inside Supabase)

- Every 5 minutes: waitlist offers older than 1 hour expire and pass to the next person.
- Every hour: nights still open after 3am the next morning close themselves and apply strikes.

## Testing the rules

Paste `supabase/tests/rules_test.sql` into the Supabase SQL editor and run it. It runs every booking rule on fake data, shows the results as an error message, and saves nothing.
