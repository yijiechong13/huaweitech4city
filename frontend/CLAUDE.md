# Project: Harm-Detection Chat Web App

## Goal

A responsive web app (phone + PC browser) for detecting harm in
code-mixed Singlish/Manglish/Mandarin chat. Judges access it via a
shared link. The ML model is built/hosted by a teammate — this repo
only CALLS it.

## CURRENT STAGE: app prototype

Right now we are building the chat app itself. Harm scoring runs on a
SIMPLE MOCK. Do NOT implement window-building, token budgets, or any
real model integration unless I explicitly ask — those come later.

## Features (in build order)

1. Auth — Supabase email/password login + signup
2. Profile — display name, avatar colour (profiles table)
3. Friends — add friend by email/username; list friends (minimal:
   no request/accept flow unless I ask)
4. Chat — 1-to-1 realtime DM using Supabase Realtime, text only
5. Harm alerts (mock) — new messages get scored by a mock Edge
   Function; alerts appear on flagged messages + a conversation banner

## Tech stack (do not deviate)

- React + Vite + TypeScript + Tailwind CSS
- @supabase/supabase-js for ALL data, auth, and realtime
- NO custom backend server in this repo. Scoring is a Supabase Edge
  Function (`score-message`), mock logic for now.

## Database (Supabase / Postgres) — contract-aligned, do not simplify

- profiles(id uuid PK -> auth.users, username text unique,
  display_name text, avatar_color text)
- friendships(user_id, friend_id, created_at) — simple two-row insert
- conversations(id uuid PK, is_group bool default false, created_at)
  -- conversations.id serves as the model contract's conversation_id
- conversation_members(conversation_id, user_id)
- messages(id uuid PK, conversation_id, sender_id, content text,
  msg_type text default 'text',
  reply_to uuid null references messages(id),
  created_at timestamptz default now())
  -- prototype is text-only; msg_type and reply_to exist so the schema
  -- matches the model contract and never needs rebuilding.
  -- receiver_id is NOT stored (derived: the other DM member).
  -- Timestamps stored as timestamptz; converted to epoch ms only when
  -- building a model payload (later stage).
- message_scores(id uuid PK, msg_id uuid references messages(id),
  label text, confidence float, created_at timestamptz default now())
- conversation_scores(id uuid PK,
  conversation_id uuid references conversations(id),
  label text, confidence float, evidence_msg_ids uuid[],
  created_at timestamptz default now())
  -- absence of rows = safe; scoring only writes problems found
- RLS on everything: users only see conversations they're members of,
  only their own profile is editable, scores visible only to members
  of the relevant conversation.
- Realtime enabled on: messages, message_scores, conversation_scores.

## Model contract (REFERENCE ONLY for now — matches team agreement)

The real model will receive a conversation window and return:
{
"message_scores": [ // empty if none
{ "msg_id": str, "label": str, "confidence": float } ],
"conversation_scores": [ // empty if none
{ "conversation_id": str, "label": str, "confidence": float,
"evidence_msg_ids": [str] } ]
}
Labels are open-ended harm types (scam, cyberbullying, grooming, ...).
Anything not flagged is safe. The two score tables above mirror this
shape exactly. Window building (token budgets, reply chains) is a
LATER task — not now.

## Mock scoring behaviour (prototype stage)

Edge Function `score-message`, called after each message send with the
last 10 messages of the conversation (simple count — no token logic):

- Any single message containing scam-ish keywords ("transfer first",
  "OTP", "click link", "bayar sekarang") -> insert a message_scores
  row { msg_id, label: "scam", confidence: 0.8 }
- If >= 2 grooming signals fire across the 10 messages -> insert ONE
  conversation_scores row { conversation_id, label: "grooming",
  confidence, evidence_msg_ids: messages containing signals }.
  Grooming signal keyword lists (multilingual):
  - recruitment_lure: "overseas job","kerja luar negara","high pay","高薪"
  - upfront_fee: "agent fee","deposit","pay first","bayar dulu"
  - passport_retention: "passport","hold documents","pegang passport"
  - secrecy_isolation: "don't tell","jangan bagitau","secret","别告诉"
  - debt_bondage: "salary deduction","owe","hutang"
  - urgency_pressure: "decide today","cepat","limited"
- Nothing fired -> write nothing (absence = safe)

## Harm alert UI (driven ONLY by contract fields)

- Message with a message_scores row -> highlight + small label badge
- Any conversation_scores row for the open conversation -> warning
  banner (label + confidence); its evidence_msg_ids messages get
  highlighted
- Conversation list: badge on any conversation that has score rows
- Do not invent extra fields (no rationale/signals in the UI — the
  real model won't return them)

## Responsive layout (important — judges use phones)

- Wide (md+): conversation list left, chat centre, alert panel right
- Phone: single column; convo list -> tap into chat; alert panel is a
  pull-up bottom sheet or toggle tab. Must look good at 380px width.

## Rules for you (Claude Code)

- Build ONLY the feature I ask for in each conversation. Nothing extra.
- Show a plan and wait for approval before writing files.
- Never commit .env files. Use .env.example with placeholder keys.
- Write SQL as migration files in supabase/migrations/ so schema is
  in git.
