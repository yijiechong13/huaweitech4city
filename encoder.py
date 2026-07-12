import json, os, torch
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("aisingapore/SEA-LION-ModernBERT-Embedding-600M")

os.makedirs("embeddings", exist_ok=True)

with open("train.jsonl") as f:
    convs = [json.loads(line) for line in f]

for conv in convs:
    texts = [m["content"] for m in conv["messages"]]
    X = model.encode(texts)
    
    #to test later on if have time
    #X = model.encode(text, prompt_name="Classification")

    torch.save(torch.tensor(X), f"embeddings/{conv['conversation_id']}.pt")
    print(f"{conv['conversation_id']}: {X.shape}")