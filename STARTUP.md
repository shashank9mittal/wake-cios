# Wake — How to Run

A step-by-step guide to running Wake locally and driving both demo paths:
the **scripted scenarios** and the **live GitHub Enterprise** integration.

## Prerequisites
- Python 3.11+
- Node 18+
- Anthropic API key (get one at console.anthropic.com)
- _(Optional)_ A GitHub token — only needed to exercise the live GHE poller

---

## Step 1 — Clone
```bash
git clone https://github.com/shashank9mittal/wake-cios
cd wake-cios
```

---

## Step 2 — Backend setup
```bash
cd backend
pip install -r ../requirements.txt
```

Create the `.env` file:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE" > .env
echo "WAKE_TIME_MULTIPLIER=16"               >> .env
```

> `WAKE_TIME_MULTIPLIER=16` → 30-second demo signals
> `WAKE_TIME_MULTIPLIER=1`  → realistic ~8-minute signals

**Optional — enable the live GitHub Enterprise poller:**
```bash
echo "GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE"      >> .env
# GHE_BASE_URL defaults to https://api.github.com for the demo.
# On a Walmart laptop, set it to the internal GHE host instead.
```

Start the backend:
```bash
uvicorn main:app --port 8000 --reload
```

| URL                              | What it is        |
| -------------------------------- | ----------------- |
| http://localhost:8000            | Backend           |
| http://localhost:8000/health     | Health check      |
| http://localhost:8000/docs       | Swagger / OpenAPI |

On startup, Wake pre-seeds the most recent merged PR (so it never re-fires an
old one) and begins polling GitHub Enterprise every 10 seconds.

---

## Step 3 — Frontend setup (new terminal)
```bash
cd wake-cios/frontend
npm install
npm run dev
```

| URL                                | What it is                       |
| ---------------------------------- | -------------------------------- |
| http://localhost:5173              | Wake dashboard                   |
| http://localhost:5173/demo         | Customer-facing storefront view  |

---

## Step 4 — Run a scripted demo

Open http://localhost:5173, click any scenario in the sidebar, and click
**Simulate Deploy**. Use the sidebar search box to filter the list.

Or trigger via curl:
```bash
# Checkout regression — signals in ~30 seconds
curl -X POST localhost:8000/trigger/deploy-001

# Prompt regression — shows in the Prompt Pulse tab
curl -X POST localhost:8000/trigger/deploy-005

# Decoy — never alerts (the whole point)
curl -X POST localhost:8000/trigger/deploy-007
```

When a signal fires, click **Investigate** to run the AI agent, then open
**Detection Replay** to replay the timeline from deploy to alert.

Reset everything:
```bash
for id in 001 002 003 004 005 006 007; do
  curl -X POST localhost:8000/reset/deploy-$id
done
```

> Restarting the backend also resets all scripted scenarios automatically.

---

## Step 5 — Run the live GitHub Enterprise demo (the showstopper)

This is the end-to-end path: a real merged PR drives a real detection.

1. Open the storefront at **http://localhost:5173/demo** on one screen and the
   **dashboard** on another.
2. In the `wake-cios` repo, **merge a PR that edits a file under `prompts/`**
   (e.g. `backend/prompts/recommendation.txt`).
3. Within ~10 seconds, Wake's poller detects the merge and:
   - adds a `ghe-pr-{number}` change event at the **top of the sidebar**,
   - **auto-triggers** monitoring for it,
   - flips the storefront copy from the concise **V1** to the verbose **V2**
     with a visible diff banner.
4. Watch the dashboard detect the behavioral regression the new copy caused —
   then click **Investigate** to have the agent name the responsible PR and
   estimate the revenue impact.

Force a poll on demand (useful when rehearsing):
```bash
curl localhost:8000/latest-deploy
curl localhost:8000/demo-state
```

The integration is idempotent: a PR that's already been processed is rebuilt in
memory on restart and never double-fires.

---

## Scenario reference

| ID         | Name                                  | Expected                            |
| ---------- | ------------------------------------- | ----------------------------------- |
| deploy-001 | Checkout regression                   | 🔴 Alert ~30s · ~$700K/hr           |
| deploy-002 | Search clean                          | 🟢 Never alerts                     |
| deploy-003 | Recommendations positive              | 🟢 Never alerts (positive drift)    |
| deploy-004 | Cart abandonment regression           | 🔴 Alert ~40s                       |
| deploy-005 | Prompt regression                     | 🔴 Alert ~30s · Prompt Pulse        |
| deploy-006 | Homepage clean                        | 🟢 Never alerts                     |
| deploy-007 | Checkout decoy                        | ⚪ Never alerts (noisy but healthy) |
| ghe-pr-{n} | Live merged PR (prompt)               | 🔴 Auto-triggered from GitHub       |

---

## Troubleshooting

| Symptom                                | Fix                                                                   |
| -------------------------------------- | -------------------------------------------------------------------- |
| Agent investigation errors out        | Confirm `ANTHROPIC_API_KEY` is set in `backend/.env`.                 |
| Signals take ~8 minutes               | Set `WAKE_TIME_MULTIPLIER=16` in `.env` and restart the backend.     |
| No `ghe-pr-*` event after merging     | Set `GITHUB_TOKEN`; ensure the PR is **merged** and touched `prompts/`. |
| Dashboard can't reach the backend     | Backend must be on port 8000; CORS is open to all origins by default.|
