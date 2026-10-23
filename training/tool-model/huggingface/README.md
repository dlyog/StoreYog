---
language: en
license: other
license_name: opt-175b-license
license_link: LICENSE.md
commercial: false
base_model: facebook/opt-350m
library_name: transformers
pipeline_tag: text-generation
tags:
- tool-calling
- function-calling
- mcp
- model-context-protocol
- small-business
- retail
- voice-assistant
- research
---

# StoreYog OPT-350M MCP tools (v6)

> **Non-commercial research use only.** This model is a fine-tune of Meta's [OPT-350M](https://huggingface.co/facebook/opt-350m) and is distributed under the **OPT-175B License Agreement** ([LICENSE.md](LICENSE.md)), which permits use only for non-commercial research purposes and excludes commercial or production use. DLYog Lab Research Services LLC does not use this model in any commercial product or service.
>
> OPT-175B is licensed under the OPT-175B license, Copyright (c) Meta Platforms, Inc. All Rights Reserved.

A 350-million-parameter model that turns a small-store owner's spoken request into [Model Context Protocol](https://modelcontextprotocol.io) tool calls, reads the real tool results, and writes a short spoken answer. It was built for **StoreYog**, an Alexa+-style assistant for a small grocery store, and is one of the three approaches compared in the paper *What Our Experience Says About MCP Tool Calling for Small Businesses: An Intelligent Router with a Small Model Is All You Need* (DLYog Lab, 2026).

## Prompt format

One line per step. The model writes the next line; stop generation at `### Result:`.

```
### Catalog: Basmati rice; Toor dal; Ghee; Jaggery; ...      the store's current products
### Owner: where did we put the gur
### Call: get_inventory {"item":"Jaggery"}                    ← model output; your code runs the tool
### Result: 1 item, opening stock, not reconciled: Jaggery | 20 of 25 x 1 kg block (80%) | reorder at 6 | price $6 cost $4 | Aisle 1, oil shelf, upper right — golden jaggery blocks.
### Answer: Jaggery is in Aisle 1, oil shelf, upper right, golden jaggery blocks. There are 20 blocks in stock.   ← model output
```

Earlier turns go in as `### Owner:` / `### Answer:` lines (the app keeps the last four). The `### Catalog:` line lists the store's products, so products added later work without retraining.

Tools the model calls:

| Call | Purpose |
| --- | --- |
| `get_inventory {"item": "..."}` | Stock, shelf location, price for one product (or `{}` for all) |
| `get_todays_transactions {}` | Today's sales |
| `reconcile_inventory {}` | Apply today's sales to stock; returns low items and suggested reorder |
| `place_reorder {"items": [...], "confirmed": false}` | Draft a supplier order (approval happens outside the model) |
| `update_inventory {"item", "stock", "expectedStock", "reason"}` | Set a counted stock level |
| `send_inventory_report {}` / `send_sales_report {}` | Email reports |
| `play_demo {}`, `play_guide {"topic": ...}`, `ask_general {}` | App-side tools: demo video, audio guides, general questions |

The result line format, the server-side safety rules and the full application are in the [StoreYog repository](https://github.com/dlyog/StoreYog) (`simulator/small-model.ts`, `simulator/agent.ts`).

## Usage

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

repo = "dlyog/storeyog-opt-350m-mcp-tools"
tok = AutoTokenizer.from_pretrained(repo)
model = AutoModelForCausalLM.from_pretrained(repo, dtype=torch.bfloat16)

def next_line(prompt):
    ids = tok(prompt, return_tensors="pt").input_ids
    out = model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=80,
                         do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.shape[1]:]).split("\n")[0]

catalog = "Basmati rice; Toor dal; Chana dal; Atta; Ghee; Jaggery; Paneer; Dahi"
prompt = f"### Catalog: {catalog}\n### Owner: where did we put the gur\n"
line = next_line(prompt)
# The model sometimes answers before calling a tool. Like the StoreYog app, treat a first-line
# answer that states a number or product as unverified and ask again with the line forced to be a call.
if line.startswith("### Answer:"):
    line = "### Call:" + next_line(prompt + "### Call:")
print(line)  # ### Call: get_inventory {"item":"Jaggery"}

# Run the tool (for example through an MCP client), then append the call and its result:
result = "1 item, opening stock, not reconciled: Jaggery | 20 of 25 x 1 kg block (80%) | reorder at 6 | price $6 cost $4 | Aisle 1, oil shelf, upper right — golden jaggery blocks."
print(next_line(prompt + line + "\n### Result: " + result + "\n"))
# ### Answer: Jaggery: Aisle 1, oil shelf, upper right, golden jaggery blocks. There are 20 blocks in stock.
```

A complete loop with an MCP client and the guard is in `simulator/agent.ts` (`smallLoop`) of the StoreYog repository; a FastAPI server is in `training/tool-model/serve_small.py`.

## Training

- **Base:** facebook/opt-350m.
- **Recipe:** follows [Jhandi et al., 2025 (arXiv 2512.15943)](https://arxiv.org/abs/2512.15943). TRL supervised fine-tuning with learning rate 5e-5, 100 warm-up steps, effective batch 32, gradient clipping 0.3, weight decay 0.01 and bf16, for 3 epochs. Training took 43 minutes on one NVIDIA DGX Spark (GB10).
- **Data:** 19,408 training and 2,880 evaluation conversations, all synthetic.
  - **How it was made:** by running the real StoreYog MCP server against a throwaway copy of a fictitious grocery store's database, so every tool result is genuine.
  - **What it covers:** where-is questions, counts, prices, products the store doesn't carry, sales, store health, restock drafts, count updates, the demo video, audio guides, general questions, and reactions that must not call a tool.
  - **Speech realism:** requests are written the way speech-to-text produces them, with wake words, fillers and Hindi grocery names.
  - **Randomised stores:** 85% of examples use a randomised store (stock, prices and shelf locations reshuffled), so the model must read tool results instead of memorising them.
  - **Held-out products:** four products are held out for evaluation.

## Evaluation

- **Offline:** 600 held-out conversations, scored on whether the first tool call exactly matches (name and arguments).
  - Products seen in training: 69.5%.
  - Held-out products: 54.3%, up from 29.9% for the previous version trained on a single fixed store.
  - Answers written after a tool result were almost always correct.
- **Live benchmark:** 30 new owner turns, 3 runs, on the StoreYog demo store, behind the same guard and server rules as the other two approaches.
  - This model: 27/30 (90.0%), with a median of 0.74 s per turn including the safety guard.
  - Gemma 4 E2B as an in-context router: 29/30.
  - Gemma 4 E2B with native tool calling: about 15/30.

## Limitations and responsible use

- **May answer without looking things up.** On a fresh store question it sometimes writes an answer before calling a tool, and that answer can be invented. Apply the rule shown in Usage: an answer stating a number or a product before any tool ran is re-asked as a tool call.
- **Narrow domain.** It knows one kind of store and one set of tools. Outside store operations it tends to guess a stock lookup. For example, "What spices go into a masala chai?" became a product lookup.
- **Health claims.** Asked "Does ghee cure diabetes?", it replied "Yes. Ghee is … in stock." Do not let it answer health questions. In StoreYog every request and reply passes a separate safety guard, and such questions should go to the general assistant.
- **No safety alignment of its own.** It has no system prompt and was not trained to refuse. Pair it with an input/output guard.
- **Never let the model alone change data or approve actions.** In StoreYog, stock updates and order drafts run only when the owner explicitly asked, and only the owner's fresh "yes" in application code confirms an order.
- **Synthetic, English-only data.** All training data is synthetic and in English. It has not been evaluated on real customer data or on other languages.

## Citation

```
Chawdhury, T. K. 2026. What Our Experience Says About MCP Tool Calling for Small Businesses:
An Intelligent Router with a Small Model Is All You Need. DLYog Lab Research Services LLC.
```

## License

Distributed under the OPT-175B License Agreement ([LICENSE.md](LICENSE.md)) for non-commercial research purposes only. OPT-175B is licensed under the OPT-175B license, Copyright (c) Meta Platforms, Inc. All Rights Reserved.
