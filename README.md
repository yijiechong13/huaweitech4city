# Harm-Detection Chat

Responsive web app for detecting harm in code-mixed Singlish/Manglish/Mandarin chat.
See [CLAUDE.md](CLAUDE.md) for the full project spec.

## Stack

React + Vite + TypeScript + Tailwind CSS v4, with `@supabase/supabase-js` for data, auth,
and realtime.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev            # http://localhost:5173
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build
