"""Step-by-step evaluation of a StoreYog small model on eval.text.jsonl.

For every '### Call:' and '### Answer:' line in a held-out conversation, the model sees everything
before that line and generates the next line greedily. Calls must match the tool name and arguments
exactly; answer steps must produce an answer (not a call).

    python eval_small.py --model runs/opt350m-v1/final --data data
"""
import argparse
import collections
import json
import os

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--data", default="data")
parser.add_argument("--limit", type=int, default=0)
args = parser.parse_args()

tokenizer = AutoTokenizer.from_pretrained(args.model)
model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16, device_map="auto").eval()


def next_line(prefix):
    ids = tokenizer(prefix, return_tensors="pt").input_ids.to(model.device)
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=160, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    text = tokenizer.decode(out[0][ids.shape[1]:], skip_special_tokens=True)
    return text.split("### Result:")[0].split("\n### Owner:")[0].strip()


def parse_call(line):
    if not line.startswith("### Call:"):
        return None
    name, _, raw = line[len("### Call:"):].strip().partition(" ")
    try:
        return name, json.loads(raw or "{}")
    except json.JSONDecodeError:
        return name, raw


rows = [json.loads(l) for l in open(os.path.join(args.data, "eval.text.jsonl")) if l.strip()]
if args.limit:
    import random
    random.Random(42).shuffle(rows)
    rows = rows[: args.limit]
score = collections.defaultdict(lambda: [0, 0])
examples = []
for row in rows:
    lines = row["text"].rstrip("\n").split("\n")
    for i, line in enumerate(lines):
        if not (line.startswith("### Call:") or line.startswith("### Answer:")) or i == 0:
            continue
        if line.startswith("### Answer:") and i < len(lines) - 1:
            continue  # an answer followed by more lines is earlier-turn context, not a step to predict
        if i < max(j for j, l in enumerate(lines) if l.startswith("### Owner:")):
            continue  # steps before the latest owner request are context
        got = next_line("\n".join(lines[:i]) + "\n")
        if line.startswith("### Call:"):
            ok = parse_call(got) == parse_call(line)
            key = f"call:{'heldout' if row.get('heldOut') else 'seen'}:{row['kind']}"
        else:
            ok = got.startswith("### Answer:")
            key = f"answer:{'heldout' if row.get('heldOut') else 'seen'}:{row['kind']}"
        score[key][0] += ok
        score[key][1] += 1
        if not ok and len(examples) < 12:
            examples.append({"expected": line[:160], "got": got[:160]})
total = [sum(v[0] for v in score.values()), sum(v[1] for v in score.values())]
calls = [sum(v[0] for k, v in score.items() if k.startswith("call")), sum(v[1] for k, v in score.items() if k.startswith("call"))]
seen = [sum(v[0] for k, v in score.items() if k.startswith("call:seen")), sum(v[1] for k, v in score.items() if k.startswith("call:seen"))]
held = [sum(v[0] for k, v in score.items() if k.startswith("call:heldout")), sum(v[1] for k, v in score.items() if k.startswith("call:heldout"))]
print(json.dumps({"overall": f"{total[0]}/{total[1]}", "tool_calls_exact": f"{calls[0]}/{calls[1]}", "calls_seen_products": f"{seen[0]}/{seen[1]}", "calls_heldout_products": f"{held[0]}/{held[1]}",
                  "by_kind": {k: f"{a}/{b}" for k, (a, b) in sorted(score.items())}}, indent=1))
print("misses:")
for e in examples:
    print(json.dumps(e))
