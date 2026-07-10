## Setup Dataset Folder

The `dataset/` directory is **gitignored** — it is not in the repo. Each team member creates it locally and adds the data files there.

Both **`raw_dataset/`** and **`preprocessed_dataset/`** are shared via the team group chat (not committed to git). Download the files from the chat and place them in the folders below.

From the repo root:

```bash
mkdir -p dataset/raw_dataset dataset/preprocessed_dataset
```

Expected layout:

```
dataset/
├── raw_dataset/
│   ├── train.jsonl
│   ├── validation.jsonl
│   └── test.jsonl
└── preprocessed_dataset/
    ├── preprocessed_train.jsonl
    ├── preprocessed_validation.jsonl
    └── preprocessed_test.jsonl
```

### `raw_dataset/`

Labelled **raw** conversation data — one conversation per JSONL line, with human-assigned labels at message and conversation level. Message `content` is the original text.

See `PROJECT_CONTEXT.md` section 6 for the canonical schema.

### `preprocessed_dataset/`

Same conversations and labels as `raw_dataset/`, but each message's `content` has been passed through the preprocessing pipeline. Structure and labels are unchanged; only message text is transformed.

See `preprocess/preprocessing_doc.md` for what preprocessing does.

---

## PROJECT_CONTEXT.md

Read this file before working with a coding agent — it holds shared project context and workflow.

Update it when you make major changes (architecture, data schema, eval setup, etc.) so the team stays aligned.
