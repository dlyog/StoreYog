"""StoreYog small tool-calling model: SFT of facebook/opt-350m on StoreYog conversations.

Recipe follows "Small Language Models for Efficient Agentic Tool Calling" (targeted SFT of OPT-350M,
learning rate 5e-5 with 100 warmup steps, effective batch 32, gradient clipping 0.3, weight decay 0.01), applied to the StoreYog compact text protocol (simulator/small-model.ts).
Data: train.text.jsonl / eval.text.jsonl from to-text.ts, generated from the real MCP tools on the
synthetic demo store.

    python train_small.py --data data --out runs/opt350m-v1 --epochs 1
"""
import argparse
import json
import os

import torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

parser = argparse.ArgumentParser()
parser.add_argument("--base", default="facebook/opt-350m")
parser.add_argument("--data", default="data")
parser.add_argument("--out", default="runs/opt350m-v1")
parser.add_argument("--epochs", type=float, default=1)
parser.add_argument("--lr", type=float, default=5e-5)
parser.add_argument("--batch", type=int, default=8)
parser.add_argument("--grad-accum", type=int, default=4)
args = parser.parse_args()

tokenizer = AutoTokenizer.from_pretrained(args.base)
tokenizer.pad_token = tokenizer.eos_token


def load(name):
    with open(os.path.join(args.data, name)) as f:
        return Dataset.from_list([{"text": json.loads(line)["text"] + tokenizer.eos_token} for line in f if line.strip()])


model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16, device_map="auto")
config = SFTConfig(
    output_dir=args.out, num_train_epochs=args.epochs, per_device_train_batch_size=args.batch,
    gradient_accumulation_steps=args.grad_accum, warmup_steps=100, max_grad_norm=0.3, weight_decay=0.01,
    gradient_checkpointing=True, learning_rate=args.lr, logging_steps=10, eval_strategy="epoch", save_strategy="epoch", save_total_limit=1,
    bf16=True, optim="adamw_torch", max_length=1024, dataset_text_field="text", report_to="none", seed=42,
)
trainer = SFTTrainer(model=model, args=config, train_dataset=load("train.text.jsonl"),
                     eval_dataset=load("eval.text.jsonl"), processing_class=tokenizer)
print("Starting StoreYog tool-calling SFT on DGX Spark...", flush=True)
trainer.train()
final = os.path.join(args.out, "final")
trainer.save_model(final)
tokenizer.save_pretrained(final)
print("saved", final, flush=True)
