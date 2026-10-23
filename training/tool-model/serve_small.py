"""OpenAI-style completions server for the StoreYog small tool-calling model.

    python serve_small.py --model runs/opt350m-v3-3ep/final --port 9010
    curl -s localhost:9010/v1/completions -d '{"prompt":"### Owner: Where is rice?\\n","stop":["### Result:"]}'
"""
import argparse
import time
import uuid

import torch
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, StoppingCriteria, StoppingCriteriaList

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--host", default="0.0.0.0")
parser.add_argument("--port", type=int, default=9010)
args = parser.parse_args()

tokenizer = AutoTokenizer.from_pretrained(args.model)
device = "cuda" if torch.cuda.is_available() else "cpu"
model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16 if device == "cuda" else torch.float32).to(device).eval()
app = FastAPI()


class OneLine(StoppingCriteria):
    """Every protocol step is a single line, so generation ends at the first newline after some text."""

    def __init__(self, start):
        self.start = start

    def __call__(self, input_ids, scores, **kwargs):
        text = tokenizer.decode(input_ids[0][self.start:], skip_special_tokens=True)
        return "\n" in text.lstrip("\n")


class Completion(BaseModel):
    prompt: str
    max_tokens: int = 160
    stop: list[str] = ["### Result:"]
    model: str = "storeyog-opt-350m"


@app.get("/health")
def health():
    return {"status": "ready", "model": args.model, "device": device}


@app.post("/v1/completions")
def complete(req: Completion):
    started = time.time()
    ids = tokenizer(req.prompt, return_tensors="pt").input_ids[:, -1800:].to(device)
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=req.max_tokens, do_sample=False, pad_token_id=tokenizer.eos_token_id,
                             stopping_criteria=StoppingCriteriaList([OneLine(ids.shape[1])]))
    text = tokenizer.decode(out[0][ids.shape[1]:], skip_special_tokens=True)
    for stop in req.stop + ["\n### Owner:"]:
        text = text.split(stop)[0]
    return {"id": f"cmpl-{uuid.uuid4()}", "object": "text_completion", "model": req.model,
            "choices": [{"index": 0, "text": text, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": ids.shape[1], "completion_tokens": out.shape[1] - ids.shape[1]},
            "metrics": {"generation_time_s": round(time.time() - started, 4), "device": device}}


if __name__ == "__main__":
    uvicorn.run(app, host=args.host, port=args.port)
