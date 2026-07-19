"""
Single-conversation scoring entrypoint -- the handoff point backend/ calls
after fetching a conversation's message window and attaching embeddings
(see backend/app/services/embedding_store.py). Reuses the exact same
stage functions gnn/conversation_gnn.py and gnn/llm_stage.py already
expose -- no new pipeline logic, matching scripts/run_batch_pipeline.py's
"one implementation per stage" principle.

Like embed.py/train.py, this module is meant to be imported with pipeline/
itself on sys.path (not as a `pipeline` package) -- see backend/app/main.py
for how it's loaded.

Expected message shape (chronological order), already embedded upstream:
    message_id             str
    sender_id              str
    text                   str   -- only used for the LLM evidence bundle,
                                     never fed into the graph/GNN
    embedding              FloatTensor[EMBED_DIM]
    reply_to_message_id    str | None

Graph edges (temporal/same_speaker/reply_to) are rebuilt fresh from message
metadata on every call via build_message_graph() -- cheap over a small
window, and keeps this function stateless. See docs/backend.md's "Graph
storage & lifecycle" for why only embeddings are cached, never the graph.
"""

import json

import torch

from gnn.config import TOP_K_EVIDENCE
from gnn.conversation_gnn import build_message_graph, MessageGraphSAGE
from gnn.llm_stage import run_llm_reasoning


def top_k_evidence(messages: list, per_message_scores: torch.Tensor, k: int) -> list:
    """
    Ranks messages by their contribution score (see MessageGraphSAGE's
    conv_head docstring for why this is a principled per-message signal)
    and returns the top-k as the small evidence bundle the LLM stage is
    deliberately given -- never the raw conversation.
    """
    scored = sorted(
        zip(messages, per_message_scores.tolist()),
        key=lambda pair: pair[1],
        reverse=True,
    )
    return [
        {"message_id": m["message_id"], "sender_id": m["sender_id"], "text": m["text"], "score": score}
        for m, score in scored[:k]
    ]


@torch.no_grad()
def score_conversation(conversation_id: str, messages: list, model: MessageGraphSAGE) -> dict:
    """
    messages: chronological, already embedded (see module docstring).
    model: a loaded MessageGraphSAGE in eval mode (caller loads this once
        at startup -- see backend/app/main.py -- and passes it in here so
        it's never reloaded per request).

    Returns the LLM stage's structured verdict:
        {conversation_label, conversation_confidence, severity,
         top_evidence_messages: [{message_id, text, score, tags}],
         gentle_alert_text}
    """
    model.eval()
    graph = build_message_graph(messages)
    conv_score, per_message_scores = model.forward_full(graph)

    evidence = top_k_evidence(messages, per_message_scores, TOP_K_EVIDENCE)
    raw_json = run_llm_reasoning(conversation_id, evidence, conv_score.item())
    return json.loads(raw_json)
