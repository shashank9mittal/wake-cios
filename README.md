# Wake — Customer Impact Observability

> **Walmart loses an estimated $340,000 an hour when a deploy quietly breaks customer behavior. Wake finds it in ~8 minutes — not 7 days.**

Wake correlates **change events** (code deploys, config flips, AI prompt updates) with **real-time customer behavioral metrics**, then uses deterministic statistical drift detection plus an AI investigation agent to tell you _what broke, why, and what it's costing you_ — minutes after the change ships.

**Built for the Walmart Global Tech CIOS Hackathon · June 2026 · Track 01: Customer Experience**

---

## The Problem

When a deploy silently degrades customer behavior — checkout conversion dips, cart abandonment creeps up — nobody finds out from the dashboards. They find out from a **weekly business review, up to 7 days later**.

Why? Because the tools we have answer the wrong questions:

| Tool                    | Answers                                 | Doesn't answer                         |
| ----------------------- | --------------------------------------- | -------------------------------------- |
| APM / Splunk / Grafana  | "Is the service healthy?"               | "Are customers behaving differently?"  |
| A/B testing platforms   | "Which variant wins?" (planned changes) | "Did this _unplanned_ deploy hurt us?" |
| Weekly business reviews | "What happened last week?"              | Anything in real time                  |

A deploy can be **technically green and behaviorally broken**. 200s across the board, latency flat — and checkout conversion down 12%. That gap is where the $340K/hour lives.

---

## The Solution

Wake closes the loop between _changes_ and _customer behavior_:

1. **Ingest change events** — Wake polls the **GitHub Enterprise API** in real time and turns every merged PR into a first-class change event (code, config, _or_ AI prompt).
2. **Watch behavioral metrics** — checkout initiation, cart abandonment, session duration, payment completion — per service, continuously.
3. **Detect drift statistically** — deterministic z-score analysis against a rolling baseline, with severity gating so noise never pages anyone.
4. **Investigate with AI** — a ReAct agent (Claude) correlates the signal to the responsible change, explains the likely mechanism, and estimates **revenue impact per hour**.
5. **Surface it for humans** — a 3-bullet, VP-ready observation card, not a wall of graphs.

Regression detected and explained in **~8 minutes** instead of surfacing in a 7-day review cycle.

---

## ⭐ Live GitHub Enterprise Integration

This is what makes Wake real, not a slideshow. Wake runs a background poller against the **GitHub Enterprise API** (`gecgithub01.walmart.com` in production; a live GitHub repo in the demo) every 10 seconds:

- A **merged PR is detected automatically** — no manual trigger — and converted into a `ghe-pr-{number}` change event that surfaces at the **top of the sidebar**.
- Wake **classifies the change** from the PR's file diff: edits under `prompts/` → `prompt`, `*config.json` → `config`, everything else → `code`. It infers the affected surface the same way.
- When the merged PR is a **prompt change**, Wake **auto-triggers monitoring** and flips the customer-facing storefront at [`/demo`](#the-demo-storefront) — so judges watch a real PR merge ripple all the way into customer behavior, live.
- The integration is **idempotent and restart-safe**: a previously processed PR is rebuilt in memory on startup and never double-fires.

**The pitch in one move:** merge a prompt PR → Wake detects it → the storefront copy visibly changes → behavioral metrics drift → Wake signals the regression and names the PR responsible. End to end, on real infrastructure.

---

## Wake vs. Existing Tools

|                                         | Wake   | Datadog         | LaunchDarkly               | Weekly Review     |
| --------------------------------------- | ------ | --------------- | -------------------------- | ----------------- |
| Detects behavioral regressions          | ✅     | ❌ (infra only) | ⚠️ (flagged changes only)  | ✅ (7 days later) |
| Correlates to specific deploy           | ✅     | ❌              | ✅                         | ❌                |
| Revenue impact estimate                 | ✅     | ❌              | ❌                         | Sometimes         |
| AI prompt changes as first-class events | ✅     | ❌              | ❌                         | ❌                |
| Noise-immune (no false alarms)          | ✅     | ❌              | ❌                         | ✅                |
| Time to detection                       | ~8 min | N/A             | Minutes (known flags only) | ~7 days           |

---

## How It Works

```
┌──────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────┐
│  GitHub Enterprise   │     │        Wake Backend          │     │    Wake Dashboard    │
│   (merged PRs)       │     │        (FastAPI)             │     │    (React + Vite)    │
│                      │     │                              │     │                      │
│ • code deploys       │poll │  • GHE poller (10s loop)     │     │ • Live drift charts  │
│ • config changes     │────▶│  • Change classifier         │────▶│ • Signal severity bar│
│ • AI prompt updates  │ 10s │  • Behavioral metric stream  │     │ • Observation card   │
└──────────────────────┘     │  • Z-score drift detection   │     │ • Revenue impact     │
                             │  • Severity gating           │     │ • Prompt Pulse tab   │
┌──────────────────────┐     │  • ReAct agent (Claude·4 tools)│   │ • Detection Replay   │
│  /demo storefront    │◀───▶│                              │     │ • Sidebar search     │
│  (customer's view)   │demo │                              │     │                      │
└──────────────────────┘state└──────────────────────────────┘     └──────────────────────┘
```

### Detection engine

- **Deterministic z-score statistics** over per-metric baselines — same input, same answer, every time. No model decides whether something is a regression; the math does.
- **Ramped confidence window**: signals require sustained deviation (a real regression fires around minute 8), so a single noisy data point never alerts.
- **Severity gating**: only deviations that clear the statistical threshold reach a human. Ordinary metric wobble is ignored by design.

### Investigation agent

When a signal fires, a **ReAct loop powered by Claude (`claude-sonnet-4-5`)** investigates using **4 read-only tools** — `get_change_artifact`, `get_segment_breakdown`, `get_surface_map`, `get_similar_incidents` — and produces:

- The **responsible change event** (the merged PR).
- A plain-English **mechanism hypothesis** for why the metric moved.
- **Estimated revenue impact per hour**, computed from `wake.config.json`.
- A **3-bullet observation card** written for a VP, not an SRE.

Every tool is read-only — Wake **observes and explains, it never auto-acts**.

---

## The `/demo` Storefront

`http://localhost:5173/demo` is the **customer's view** — a simulated product recommendation widget. It polls Wake's `/demo-state` and re-renders the live recommendation copy:

- **V1 (concise):** _"Great value. Highly rated. Ships free."_
- **V2 (conversational):** a long, verbose paragraph shipped by the prompt change.

When a prompt PR merges, this page flips from V1 to V2 in real time with a visible diff banner — the literal thing the customer now sees — while the main dashboard simultaneously detects the behavioral regression the new copy caused. One screen shows the cause, the other shows the effect.

---

## Demo Scenarios

Wake ships with 7 scripted scenarios that exercise every path of the engine, plus the live GHE path above.

| ID         | Scenario                                          | Type           | Outcome                          |
| ---------- | ------------------------------------------------- | -------------- | -------------------------------- |
| deploy-001 | Checkout Step 2 Payment UI Refactor               | Code deploy    | 🔴 Signals ~min 8 · ~$700K/hr    |
| deploy-002 | Search Ranking Latency Optimization               | Code deploy    | 🟢 Never signals                 |
| deploy-003 | Personalized Recommendations Collaborative Filter | Code deploy    | 🟢 Positive drift, no alert      |
| deploy-004 | Cart Service Promo Code Validation Refactor       | Code deploy    | 🔴 Signals ~min 10               |
| deploy-005 | Product Recommendation Prompt Tone Shift          | **Prompt**     | 🔴 Signals ~min 8 · Prompt Pulse |
| deploy-006 | Homepage Hero Banner Feature Flag Rollout         | Config         | 🟢 Never signals                 |
| deploy-007 | Checkout API Token Refresh Timing Fix — **decoy** | Code deploy    | ⚪ **Never alerts** — the point  |

**Scenario 007 is the heart of the pitch.** Its checkout metric dips below baseline — exactly what a threshold alert would page on. Wake stays silent because, statistically, the movement is within normal variance. **No false alarms is a feature, not a gap.**

---

## What's Real vs. Simulated

- **Real**: the GitHub Enterprise polling integration and change classifier, the z-score detection engine, severity gating, ramp logic, the ReAct investigation agent, live Claude API integration, and the full React dashboard.
- **Simulated**: customer behavioral metric streams, generated by a deterministic, hash-seeded simulator so every demo is reproducible.

The simulator is a stand-in for the behavioral event pipelines that already exist at Walmart. Swapping in a real stream (Kafka/Flink) changes the _data source_, not the _engine_. That's the design: **config-once, monitor always**.

---

## Quickstart

**Prerequisites**: Python 3.11+, Node 18+, an Anthropic API key. _(A GitHub token is optional — only needed to exercise the live GHE poller.)_

```bash
# 1. Clone
git clone https://github.com/shashank9mittal/wake-cios && cd wake-cios

# 2. Backend
cd backend
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
echo "WAKE_TIME_MULTIPLIER=16"     >> .env   # 30-second demo signals (set to 1 for real-time)
pip install -r ../requirements.txt
uvicorn main:app --port 8000 --reload

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev
# Dashboard at http://localhost:5173 · Storefront at http://localhost:5173/demo
```

**Run a scripted demo:**

```bash
# Trigger the checkout regression scenario
curl -X POST localhost:8000/trigger/deploy-001

# Watch the dashboard — the signal fires in ~30 seconds
# Click Investigate when the alert appears
```

**Reset everything:**

```bash
for id in deploy-001 deploy-002 deploy-003 deploy-004 deploy-005 deploy-006 deploy-007; do
  curl -X POST localhost:8000/reset/$id
done
# Or just restart the backend — a server restart is a clean slate.
```

See **[STARTUP.md](./STARTUP.md)** for the full step-by-step run guide, including the live GitHub Enterprise demo.

---

## Configuration

Edit `backend/data/wake.config.json` to point Wake at any service:

```json
{
  "team": "Checkout Experience",
  "service": "checkout-api",
  "monitored_metrics": [
    "checkout_initiation_rate",
    "cart_abandonment_rate",
    "session_duration_s",
    "payment_completion_rate"
  ],
  "alert_sensitivity": "standard",
  "revenue_per_session": 47,
  "sessions_per_minute": 26000
}
```

`revenue_per_session` and `sessions_per_minute` drive the agent's revenue-impact math; `monitored_metrics` defines what the engine watches. **Config-once, monitor always — ~15-minute setup.**

### Environment variables

| Variable               | Required | Purpose                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | Yes      | Powers the ReAct investigation agent.                               |
| `WAKE_TIME_MULTIPLIER` | No       | Demo speed. `16` = ~30s signals; `1` = realistic ~8-min signals.    |
| `GITHUB_TOKEN`         | No       | Auth for the live GHE poller (falls back to `GHE_TOKEN`).           |
| `GHE_BASE_URL`         | No       | GHE API base. Defaults to `https://api.github.com` for the demo.    |

---

## API Reference

| Endpoint                 | Method | What it does                                              |
| ------------------------ | ------ | --------------------------------------------------------- |
| `/health`                | GET    | Liveness check + count of scenarios loaded.               |
| `/config`                | GET    | Current `wake.config.json` values.                        |
| `/changes`               | GET    | All change events with live status & severity (GHE-first).|
| `/metrics/{change_id}`   | GET    | Live z-score statistics for a triggered scenario.         |
| `/latest-deploy`         | GET    | Force a GHE poll; report the most recent merged PR.       |
| `/demo-state`            | GET    | Current storefront prompt version (drives `/demo`).       |
| `/trigger/{scenario_id}` | POST   | Start monitoring a scenario.                              |
| `/investigate`           | POST   | Run the AI investigation on an active signal.             |
| `/reset/{scenario_id}`   | POST   | Reset a scenario to idle so it can be re-run.             |

Interactive Swagger docs at `http://localhost:8000/docs`.

---

## Frontend

- **Live drift dashboard** — per-metric charts (Recharts) streaming from the first datapoint, with a signal-severity bar.
- **Observation card** — the agent's 3-bullet VP summary, responsible PR, affected-user count, and revenue impact.
- **Prompt Pulse** — a dedicated view for AI-prompt changes, surfacing prompt regressions distinctly from code/config.
- **Detection Replay** — replay any detection timeline from the moment of deploy to the signal firing.
- **Sidebar search & filter** — instantly filter the change list; GHE-sourced PRs are pinned to the top.
- **Contextual tooltips & shimmer loaders** — Walmart-blue tooltips on key controls; skeleton states while metrics load.
- **`/demo` storefront** — the customer-facing recommendation widget described above.

---

## Tech Stack

- **Backend**: FastAPI · Python · deterministic z-score engine · hashlib-seeded scenario simulator · async GHE poller.
- **Agent**: Anthropic Claude (`claude-sonnet-4-5`) · ReAct loop · 4 read-only tools · exponential-backoff retry on `529`.
- **Frontend**: React 19 · TypeScript · Vite · Recharts.
- **Change source**: GitHub Enterprise API — real merged PRs (`gecgithub01.walmart.com` in production).
- **Data**: in-memory from `scenarios.json` — no database, fully reproducible.

---

## Roadmap

- Plug into real behavioral event streams (Kafka/Flink replacing the simulator).
- Auto-rollback trigger when revenue impact crosses a configurable threshold.
- Slack/Teams alert delivery with the observation card inline.
- Multi-service blast-radius analysis for shared-dependency deploys.
- Scheduled baseline recalibration to absorb organic metric drift.

---

**Built by Shashank Mittal · Walmart Global Tech · CIOS Hackathon, June 2026**
