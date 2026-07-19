# Harm-Detection Chat

Responsive web app (phone + PC browser) for detecting harm in code-mixed
Singlish/Manglish/Mandarin chat: 1-to-1 realtime DMs where new messages are
scored for harm (scam, grooming, …) and flagged messages/conversations show
alerts. See [CLAUDE.md](CLAUDE.md) for the full project spec.

## Stack

- React + Vite + TypeScript + Tailwind CSS v4
- [Supabase](https://supabase.com) via `@supabase/supabase-js` for **all**
  auth, data, and realtime — no custom backend server in this repo
- One Supabase Edge Function, [`score-message`](supabase/functions/score-message/index.ts),
  currently mock keyword-based scoring. Scoring is best-effort: it runs after
  each send and a scoring failure never blocks or fails the message.

## Environment variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (Dashboard → Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (client-safe by design) |

Never commit `.env` — it is gitignored; [.env.example](.env.example) holds the
placeholders. If either variable is missing, the app shows a config-error
screen explaining what to set instead of loading.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev            # http://localhost:5173
```

Scripts:

- `npm run dev` — start the dev server
- `npm run build` — type-check (`tsc -b`) and build for production
- `npm run preview` — preview the production build

## Supabase setup

1. Create a Supabase project and link it:
   `supabase link --project-ref <your-project-ref>`
2. Apply the migrations in [supabase/migrations/](supabase/migrations/)
   (`supabase db push`, or paste them into the SQL editor in order). They
   create all tables, RLS policies, and enable realtime on `messages`,
   `message_scores`, and `conversation_scores`.
3. Deploy the mock scorer: `supabase functions deploy score-message`

## Deploy to Vercel

1. Import the repo — Vercel auto-detects Vite (`npm run build`, output `dist/`).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under
   Project Settings → Environment Variables. Vite inlines env vars at build
   time, so **redeploy after changing them**.
3. [vercel.json](vercel.json) rewrites all routes to `index.html` so deep
   links like `/chat/:id` survive a hard refresh.

## Model integration (later)

The mock `score-message` Edge Function will be swapped for the real
harm-detection model (built and hosted by a teammate — this repo only calls
it). The request/response contract, including the `message_scores` /
`conversation_scores` response shape the UI is driven by, is documented in
[CLAUDE.md](CLAUDE.md) under **"Model contract"**. Window building (token
budgets, reply chains) is part of that later stage too.
