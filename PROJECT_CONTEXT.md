# Harm Pattern Recognition Assistant — Project Context

## 1. Task
Real-time system that detects **scam, cyberbullying, and grooming** in code-mixed Singlish messaging.
Goal: **empower user decisions** — surface flagged messages/patterns. It does **not** auto-block or auto-report.

The model never scores a message in isolation. It receives a **conversation** (ordered batch of messages) and produces a conversation-level score; per-message evidence scores fall out as a derived byproduct of that same score (not an independently trained signal — see `docs/README.md`'s "Evidence-score derivation").

## 2. Requirements (status as implemented)
- **Conversation-level head:** binary `harmful` / `safe`. **Confirmed, implemented** — the sole trained output (`MessageGraphSAGE.conv_head` in `gnn/conversation_gnn.py`), a single sigmoid mapping directly onto `binary_conversation_label`.
- **Message-level head:** **dropped** as a separately-trained head (was "Definite" in the original plan). Per-message scores still exist, but only as a byproduct of the conversation-level head's own weights applied per-node before pooling — no message-level labels are used or needed.
- **4-class typed head:** **dropped**, not implemented. `conversation_label`'s 4-class value is not currently a training target.
- **GNN target (binary vs 4-class):** decided — binary.
- **Eval metric:** macro-F1 (not accuracy) — implemented in `train.py`. Splits are currently **train/validation only**, no held-out test set yet (see `docs/README.md`'s Known Limitations) — conversation-level splitting (no message leakage across splits) still holds.
- **GNN justification** (ship the GNN only if it beats a transformer-only baseline by more than seed variance): **not yet formally validated** — GraphSAGE was adopted directly; this baseline comparison is still open if it matters going forward.

## 3. Languages
English, Malay, Mandarin, Tamil — and **code-mixed Singlish** across them.

**⚠️ Open conflict, not yet resolved:** the current `preprocess/` implementation
(`docs/preprocessing_doc.md`) explicitly assumes **English/Singlish only, no Mandarin or
Tamil scripts** — it treats non-Latin characters as obfuscation/spoofing signal. That's a
real behavioral consequence, not just a doc gap: genuine Mandarin or Tamil text would
currently be miscategorized by the spoofed-link/homoglyph logic. Someone needs to decide
whether multilingual coverage was intentionally deferred for the first pass (in which case
this section should say so explicitly) or whether `preprocess/` needs to be extended.

## 4. Architecture (status as implemented)

```
sentence-embedding model  ->  message-node graph  ->  GraphSAGE  ->  conversation-level binary score  ->  LLM reasoning stage
```

Full detail: `docs/README.md`.

- **Encoder:** confirmed — `aisingapore/SEA-LION-ModernBERT-Embedding-600M` (`embed.py`'s `DEFAULT_MODEL`), 1024-dim (`gnn/config.py`'s `EMBED_DIM`).
- **GNN:** confirmed — GraphSAGE (not R-GCN/GATv2), 2 layers, via PyTorch Geometric's `HeteroConv`+`SAGEConv`. Directed edges, 3 types: `temporal`, `same_speaker`, `reply_to` (as originally proposed here). **No fixed conversation window** (the "20–50 messages" cap in the original plan isn't implemented — `same_speaker` edges are capped per-sender instead, via `SAME_SPEAKER_WINDOW`, not the whole conversation).
- **LLM reasoning stage:** originally listed as out of scope (§8) — **now implemented**, `gnn/llm_stage.py`. See §8 below and `docs/README.md`.
- `message_label_reason` is a **closed/fixed vocab kept just in case** — not freely expanded, not a training target right now (to be tested with limited data).

## 5. Tech Stack
- PyTorch Geometric — confirmed, in use.
- Snorkel (weak supervision), active learning — still aspirational, not implemented.
- Encoder — confirmed, see §4.
- Data stored as **JSONL** (one conversation per line).
- Compute: developed against MPS (Apple Silicon) and CPU; GPU laptop / Colab free tier remain viable options, nothing compute-specific is hardcoded.

## 6. Data Schema (canonical training format)

JSONL, one conversation per line. Example:

```jsonl
{"conversation_id": "conv1_1", "binary_conversation_label": "harmful", "conversation_label": "scam", "user1_id": "user1_1", "user2_id": "user1_2", "messages": [{"message_id": "conv1_1_1", "sender_id": "user1_1", "recipient_id": "user1_2", "timestamp": "...", "content": "...", "reply_to_message_id": null, "message_label": "harmful", "message_label_reason": "redirection"}]}
```

**Conversation fields:** `conversation_id`, `binary_conversation_label`, `conversation_label`, `user1_id`, `user2_id`, `messages[]`
**Message fields:** `message_id`, `sender_id`, `recipient_id`, `timestamp`, `content`, `reply_to_message_id`, `message_label`, `message_label_reason`

### Target attributes (explicit)
| Field | Level | Type | Use |
|---|---|---|---|
| `message_label` | message | binary (`harmful`/`safe`) | message head — trained directly, no mapping |
| `binary_conversation_label` | conversation | binary (`harmful`/`safe`) | **binary head** — trained directly, no mapping. Precomputed from `conversation_label` (`safe -> safe`, else `harmful`) |
| `conversation_label` | conversation | typed (`scam`/`cyberbullying`/`grooming`/`safe`) | **4-class head:** use raw typed value |

Note: the 4-class head is **conversation-level only**. There is no typed source at message level (`message_label` is binary; `message_label_reason` is a **closed/fixed vocab** — not freely expanded — kept and to be tested with limited data, not a training class right now).

### Conventions
- `conversation_id` = `conv<labeller_id>_<n>`, labeller_id 1–5. This is **bookkeeping only** — the model must **not** parse meaning from it.
- `message_id` follows `<conversation_id>_<n>`.
- Safe messages: `message_label` = `"safe"`, `message_label_reason` = `null`.
- Dataset contains **multiple harm types** generated across labellers — not scam-only.

## 7. Output Contract

The shape below was the original plan; it hasn't been implemented as literally written
(no separate `message_scores`/`conversation_scores` arrays with per-message
`label`/`confidence`). What's actually implemented is `gnn/llm_stage.py`'s
`run_llm_reasoning()` contract — one JSON object per conversation:

```
{
  "conversation_label": "harmful" | "safe",
  "conversation_confidence": <float 0-1>,       // sigmoid prob. from the conversation-level head
  "severity": "low" | "medium" | "high",
  "top_evidence_messages": [
    { "message_id": "...", "text": "...", "score": <float>, "tags": ["..."] }
  ],
  "gentle_alert_text": "<one short sentence suitable for showing directly to the user>"
}
```

`score` on each evidence message is that message's derived contribution to the
conversation-level score (see §2/§4), not an independently-calibrated per-message
probability. If the original array-of-message_scores / array-of-conversation_scores shape
is still wanted (e.g. for a specific downstream consumer/UI contract), that would be a
translation layer on top of the above, not implemented yet.

## 8. Scope
- **First pass:** 2-speaker DMs, text-only.
- **Deferred / future:** N-party group chats (`group_id`, array recipients, `msg_type`).
- **LLM explanation stage:** originally listed as a deferred/out-of-scope next stage —
  **now implemented** (`gnn/llm_stage.py`, see §7's actual contract above and
  `docs/README.md`). It's prompt-only over pre-scored evidence, not a trained/fine-tuned
  head, and is still a separate consumer of the GNN's output, not part of the GNN itself.
- **Owner:** Fabian — GNN prediction + architecture.

## 9. Known Schema Issues (to fix — flagged, not yet resolved)
1. **Live vs training field-name drift.** Live input uses `msg_id` / `receiver_id` / `reply_to` and epoch-ms time. Canonical = training names (`message_id`, `recipient_id`, `reply_to_message_id`) + **Unix time**. Live must be mapped to canonical. Training `timestamp` is now **Unix seconds (integer)** — converted from the original ISO 8601 values. Note the unit gap: training is epoch-**seconds**, live is epoch-**ms**.
2. **`content` overloading.** It is sometimes the message text, sometimes a URL to a cloud DB holding the content. Needs disambiguation. (Fabian will fix.)
3. **`msg_type`** (live) is undefined and absent from training. If non-text (image/voice) is possible, the text model has no path for it.
