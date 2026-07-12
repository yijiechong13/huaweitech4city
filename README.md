# Harm Pattern Recognition Assistant

Real-time system that flags cyberbullying/grooming/scam patterns in code-mixed conversations.

- **What this is and why it's built this way:** [docs/README.md](docs/README.md) — model architecture (message-graph GNN + LLM reasoning stage), design rationale, known limitations.
- **Task/requirements/data-schema context:** [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — read this before working with a coding agent on this repo.
- **What message preprocessing does:** [docs/preprocessing_doc.md](docs/preprocessing_doc.md).

## Project structure

```
.
├── main.py                 Architecture-verification demo — mock data, zero external
│                            dependencies. Confirms the GNN's two call paths (streaming vs
│                            batch) agree, and exercises the LLM stage. Not for real predictions.
├── embed.py                 Preprocesses + embeds a conversations JSONL file into a
│                            message_id-keyed .npz (also usable as a library: see
│                            load_embedding_model()/embed_conversations()).
├── train.py                 Trains MessageGraphSAGE on labeled conversations + an
│                            embeddings file; reports per-class precision/recall/F1.
├── pipeline.py               The real end-to-end orchestrator — trains a checkpoint if
│                            none exists yet (else loads it), then runs every stage
│                            (preprocess → embed → graph construction → GNN forward pass)
│                            over a given conversations file. Start here.
├── requirements.txt
├── .env.example              Copy to .env and set ANTHROPIC_API_KEY (used by the LLM stage)
│
├── gnn/                      Model architecture package
│   ├── conversation_gnn.py    build_message_graph, MessageGraphSAGE, ConversationGraphState
│   ├── llm_stage.py            run_llm_reasoning — turns a score + evidence into a short
│   │                          human-readable explanation via Claude
│   ├── config.py                Shared constants: EMBED_DIM, HIDDEN_DIM, SAME_SPEAKER_WINDOW,
│   │                          CONV_LABELS, TOP_K_EVIDENCE, LLM_MODEL
│   └── __init__.py
│
├── preprocess/                Message-text normalization package (PII/identifier masking,
│   │                          entity tagging — see docs/preprocessing_doc.md)
│   ├── pipeline.py              preprocess_message() — the public entry point
│   ├── identifiers.py, entities.py, patterns.py, segments.py, spoofing.py, lexicons.py
│   │                            — implementation, not called directly from outside the package
│   └── __init__.py
│
├── docs/
│   ├── README.md                GNN + LLM architecture: design, call paths, rationale
│   └── preprocessing_doc.md      preprocess/ spec: token inventory, rules, worked examples
│
├── dataset/                    Gitignored — each team member populates locally (see below)
└── checkpoints/                Gitignored — trained model weights land here by default
```

## Getting started

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in ANTHROPIC_API_KEY (needed for the LLM reasoning stage)
```

### Dataset

The `dataset/` directory is **gitignored** — each team member creates it locally. Get
`train.jsonl` and `validation.jsonl` from the team channel and place them directly under
`dataset/`:

```
dataset/
├── train.jsonl
└── validation.jsonl
```

One conversation per JSONL line, human-labeled at both message and conversation level —
see [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) §6 for the canonical schema. There's no
separate pre-processed copy of the dataset to fetch: `embed.py`/`pipeline.py` run
`preprocess.preprocess_message()` on each message inline, immediately before embedding —
see [docs/preprocessing_doc.md](docs/preprocessing_doc.md) for what that step does.

### Running it

| Command | What it does |
|---|---|
| `python main.py` | No setup beyond `pip install`. Sanity-checks the GNN architecture itself on mock data — no dataset or checkpoint needed. |
| `python pipeline.py --input-jsonl dataset/train.jsonl` | The real pipeline. Trains a model on `dataset/train.jsonl` + `dataset/validation.jsonl` if `checkpoints/message_graph_sage.pt` doesn't exist yet, otherwise loads it — then scores every conversation in `--input-jsonl`. |
| `python embed.py --input-jsonl <file> --output <file>.npz` | Just the preprocess+embed stage, saved to disk for reuse. |
| `python train.py --train-embeddings <file> --val-embeddings <file>` | Just the training stage, given pre-computed embeddings. |

Each script's own module docstring has the full flag list and explains its role relative
to the others in more detail.

## PROJECT_CONTEXT.md

Read this file before working with a coding agent — it holds shared project context and workflow.

Update it when you make major changes (architecture, data schema, eval setup, etc.) so the team stays aligned.
