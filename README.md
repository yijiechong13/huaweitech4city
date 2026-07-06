## Setup Dataset Folder

From the repo root, create this structure:

```
dataset/
├── raw/
└── preprocessed/
```

- **`raw/`** — place `train.jsonl`, `test.jsonl`, and `validation.jsonl` here (last updated: 6 Jul 2026)
- **`preprocessed/`** — store processed conversation data here

## PROJECT_CONTEXT.md

Read this file before working with a coding agent — it holds shared project context and workflow.

Update it when you make major changes (architecture, data schema, eval setup, etc.) so the team stays aligned.