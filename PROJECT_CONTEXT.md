# Harm Pattern Recognition Assistant — Project Context

## 1. Task
Real-time system that detects **scam, cyberbullying, and grooming** in code-mixed Singlish messaging.
Goal: **empower user decisions** — surface flagged messages/patterns. It does **not** auto-block or auto-report.

The model never scores a message in isolation. It receives a **conversation** (ordered batch of messages) and scores at both message and conversation level.

## 2. Requirements
- **Message-level head:** binary `harmful` / `safe`. (Definite.)
- **Conversation-level head:** binary `harmful` / `safe`. (Tested first.)
- **4-class typed head:** kept **open** as an experiment (safe / scam / cyberbullying / grooming). Not dropped, not assumed.
- **GNN target** (binary vs 4-class): decide empirically later. **Do not assume a method first.**
- **Eval metric:** macro-F1 (not accuracy), conversation-level train/val/test splits.
- **GNN justification:** ship the GNN only if it beats a transformer-only baseline on conversation-level macro-F1 by more than seed variance. Baseline is a measuring stick, not a competitor.

## 3. Languages
English, Malay, Mandarin, Tamil — and **code-mixed Singlish** across them.
(First pass focuses on the schema/pipeline; multilingual coverage depends on encoder choice below.)

## 4. Architecture
General pipeline is valid:

```
transformer encoder  ->  node vectors  ->  GNN  ->  {message head, conversation head}
```

- **Encoder (recommendation, not confirmed):** XLM-R, LionGuard 2, SEA-LION, or SingBERT.
- **GNN:** R-GCN or heterogeneous GATv2, 2 layers. Directed edges, 3 types: `temporal`, `same-speaker`, `reply-to`. Conversation windows of 20–50 messages.
- `message_label_reason` is a **closed/fixed vocab kept just in case** — not freely expanded, not a training target right now (to be tested with limited data).

## 5. Tech Stack (recommendations — not confirmed, do not treat as definite)
- PyTorch Geometric, Snorkel (weak supervision), active learning.
- Encoders as above.
- Data stored as **JSONL** (one conversation per line).
- Compute: GPU laptop + Google Colab free tier.

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

## 7. Output Contract (`predict()`)

```
{
  message_scores:      [ { message_id, label, confidence }, ... ],   // empty if no message is harmful
  conversation_scores: [ { conversation_id, label, confidence, evidence_msg_ids }, ... ]  // empty if no pattern harm
}
```

- `confidence` = sigmoid probability of the binary head. **Optional.**
- `evidence_msg_ids` = the messages that built up to a flagged conversation (for app highlighting).
- Anything not listed = scanned and safe.

## 8. Scope
- **First pass:** 2-speaker DMs, text-only.
- **Deferred / future:** N-party group chats (`group_id`, array recipients, `msg_type`).
- **Next stage (out of scope here):** once a conversation is flagged harmful, all its messages + labels are passed to a downstream **LLM** to interpret and explain the problem. This is a separate consumer of the model output, not part of the model-building work.
- **Owner:** Fabian — GNN prediction + architecture.

## 9. Known Schema Issues (to fix — flagged, not yet resolved)
1. **Live vs training field-name drift.** Live input uses `msg_id` / `receiver_id` / `reply_to` and epoch-ms time. Canonical = training names (`message_id`, `recipient_id`, `reply_to_message_id`) + **Unix time**. Live must be mapped to canonical. Training `timestamp` is now **Unix seconds (integer)** — converted from the original ISO 8601 values. Note the unit gap: training is epoch-**seconds**, live is epoch-**ms**.
2. **`content` overloading.** It is sometimes the message text, sometimes a URL to a cloud DB holding the content. Needs disambiguation. (Fabian will fix.)
3. **`msg_type`** (live) is undefined and absent from training. If non-text (image/voice) is possible, the text model has no path for it.
