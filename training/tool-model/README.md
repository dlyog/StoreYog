# StoreYog small tool-calling model

A 350M-parameter model (`facebook/opt-350m`) fine-tuned to act as the web simulator's Alexa+-style assistant: it maps an owner's spoken request to StoreYog MCP tool calls, reads the real tool results, and writes the short spoken answer. The approach follows [Small Language Models for Efficient Agentic Tool Calling](https://arxiv.org/html/2512.15943v2) (targeted SFT of OPT-350M; learning rate 5e-5, 100 warmup steps, effective batch 32, gradient clipping 0.3, weight decay 0.01). The paper trained one epoch on 187k ToolBench examples; our dataset is about 15k, so we train three epochs.

The classic Alexa skill (`classical-alexa/`) does not use this model.

## Protocol

One line per step (`simulator/small-model.ts`, shared by training and the app):

```
### Catalog: Basmati rice; Toor dal; ...      the store's current products (read from get_inventory)
### Owner: where's the gur?
### Call: get_inventory {"item":"Jaggery"}     generation stops here; the app runs the MCP tool
### Result: 1 item, reconciled today: Jaggery | 20 of 25 x 1 kg block (80%) | ... | Aisle 1, oil shelf, upper right
### Answer: Jaggery is in Aisle 1, oil shelf, upper right. There are 20 blocks in stock.
```

The catalog line lets products added later work without retraining. Order approval stays in server code: the model can only draft (`confirmed:false`); the owner's next explicit "yes" confirms. If the model states a number before any tool ran, the server re-asks with the line forced to start as a tool call.

## Data

`build-dataset.ts` runs the real MCP server in-process against a throwaway copy of the synthetic Little India Grocery database, so every tool result is genuine. Report emails are never sent (their results are written in). It covers where-is, counts, availability, prices, follow-ups, products not carried, sales, store health, alerts, restock drafts (all or only named items), declines, explicit orders, count updates (reconciling first when needed), reports and no-tool chat, with spoken variation (wake words, fillers, lowercase speech-to-text, "dahl"/"daal", Hindi grocery names). About half the examples carry earlier unrelated turns. Four products are held out of training to measure generalisation.

```sh
sqlite3 .runtime/storeyog.sqlite ".backup '/tmp/train.sqlite'"
SCALE=12 DATABASE_PATH=/tmp/train.sqlite node --import tsx training/tool-model/build-dataset.ts /tmp/storeyog-data
node --import tsx training/tool-model/to-text.ts /tmp/storeyog-data
```

`build-dataset.ts` also writes the OpenAI-style `{tools, messages}` conversations (`train.jsonl`, `eval.jsonl`).

## Train, evaluate, serve (on the GPU host)

```sh
python train_small.py --data data --out runs/opt350m-v5 --epochs 3
python eval_small.py --model runs/opt350m-v5/final --data data --limit 600
python serve_small.py --model runs/opt350m-v5/final --port 9010
```

App configuration (`.env`):

```dotenv
SIMULATOR_LLM_PROTOCOL=storeyog-small
SIMULATOR_LLM_URL=http://<gpu-host>:9010
SIMULATOR_LLM_MODEL=storeyog-opt-350m
```

Without these, the simulator uses the configured chat-completions LLM with Gemma 4 native tool calling.
