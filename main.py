"""
End-to-end workflow demo: mocked message embeddings -> message graph
construction -> GraphSAGE -> conversation-level binary score (+ per-message
evidence scores as a byproduct) -> LLM reasoning stage.

Demonstrates BOTH call paths from gnn/conversation_gnn.py:
  - streaming (ConversationGraphState.add_message): messages fed in one at a
    time, exactly as production would receive them -- the graph is extended
    and only the new message's local neighborhood is processed, never a
    full rebuild.
  - batch (build_message_graph + model.forward_full): the same messages
    scored in one shot, as a cold-start/backfill path would. Its final
    conv_score should match the streaming path's final value, since both
    drive the same trained weights over the same (directed) graph -- this
    is a cheap correctness check that the two paths actually agree.

Everything here is untrained (random init weights), so scores are
meaningless numerically -- this demo verifies data-flow/shapes and
streaming/batch equivalence, not prediction quality. Swap in a real,
trained embedding model + trained weights before drawing conclusions from
output.
"""

import torch

from gnn.config import EMBED_DIM, TOP_K_EVIDENCE
from gnn.conversation_gnn import build_message_graph, MessageGraphSAGE, ConversationGraphState
from gnn.llm_stage import run_llm_reasoning


def mock_message_embeddings(texts):
    """
    Stand-in for a real embedding model. Replace this with e.g.:
        model.encode(texts)  # -> np.ndarray [len(texts), EMBED_DIM]
        torch.tensor(...)
    The rest of the pipeline only cares that you hand it a
    FloatTensor [EMBED_DIM] per message — swap this function out and
    nothing else needs to change.
    """
    return torch.randn(len(texts), EMBED_DIM)


def run_conversation(conv_id, messages, model):
    """
    messages: list of dicts, chronological order, shaped like the canonical
        schema: {message_id, sender_id, text, reply_to_message_id}.
    """
    print(f"\n=== Conversation {conv_id} ===")
    for m in messages:
        print(f"  [{m['sender_id']}] {m['text']}")

    embeddings = mock_message_embeddings([m["text"] for m in messages])
    for m, emb in zip(messages, embeddings):
        m["embedding"] = emb

    # --- streaming path: feed messages one at a time, as production would ---
    state = ConversationGraphState(model)
    print("  Streaming (one message at a time):")
    conv_score = None
    for m in messages:
        conv_score, message_score = state.add_message(
            m["message_id"], m["sender_id"], m["embedding"], m.get("reply_to_message_id")
        )
        print(f'    + [{m["sender_id"]}] "{m["text"]}"  ->  conv_score={conv_score:.4f}  message_score={message_score:.4f}')

    # --- batch/cold-start path: score the same, now-complete conversation in one shot ---
    graph = build_message_graph(messages)
    with torch.no_grad():
        batch_conv_score, _ = model.forward_full(graph)
    print(f"  Batch (cold-start) conv_score={batch_conv_score.item():.4f}  (streaming final was {conv_score:.4f})")

    # --- evidence selection: top-k messages by streaming message_score ---
    scored = sorted(zip(messages, state.message_scores), key=lambda pair: -pair[1])
    top = scored[:min(TOP_K_EVIDENCE, len(messages))]
    evidence_messages = [
        {
            "message_id": m["message_id"],
            "text": m["text"],
            "sender_id": m["sender_id"],
            "score": round(score, 4),
        }
        for m, score in top
    ]

    # --- LLM reasoning stage ---
    print("  Calling LLM for final reasoning...")
    try:
        llm_output = run_llm_reasoning(conv_id, evidence_messages, conv_score)
        print("  LLM output:")
        print(llm_output)
    except RuntimeError as e:
        print(f"  [skipped LLM call] {e}")


def main():
    model = MessageGraphSAGE()
    model.eval()

    run_conversation("conv_001", [
        {"message_id": "conv_001_m0", "sender_id": "user_a", "text": "hey are you coming to the party", "reply_to_message_id": None},
        {"message_id": "conv_001_m1", "sender_id": "user_b", "text": "nobody wants you there tbh", "reply_to_message_id": "conv_001_m0"},
        {"message_id": "conv_001_m2", "sender_id": "user_b", "text": "yeah just stay home like always", "reply_to_message_id": "conv_001_m1"},
    ], model)

    run_conversation("conv_002", [
        {"message_id": "conv_002_m0", "sender_id": "user_c", "text": "hi! how's your day going", "reply_to_message_id": None},
        {"message_id": "conv_002_m1", "sender_id": "user_d", "text": "it's ok i guess, kinda stressed", "reply_to_message_id": "conv_002_m0"},
    ], model)

    # Edge-case sanity check: a single-message conversation has zero possible
    # temporal/same_speaker/reply_to edges -- exercises the all-empty
    # edge_index path on both the streaming and batch code paths.
    run_conversation("conv_003", [
        {"message_id": "conv_003_m0", "sender_id": "user_e", "text": "u still there?", "reply_to_message_id": None},
    ], model)


if __name__ == "__main__":
    main()
