# Wake — Customer Impact Observability

> **Walmart loses $340,000 an hour when a deploy quietly breaks customer behavior. Wake finds it in 8 minutes — not 7 days.**

Wake correlates **change events** (code deploys, config changes, AI prompt updates) with **real-time customer behavioral metrics**, and uses statistical drift detection + an AI investigation agent to tell you _what broke, why, and what it's costing you_ — minutes after the change ships.

**Built for the Walmart CIOS Hackathon · June 2026 · Track 01: Customer Experience**

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

1. **Ingest change events** — deploys, config flips, AI prompt updates (pulled from GitHub Enterprise PRs)
2. **Watch behavioral metrics** — conversion rate, cart abandonment, session duration, payment completion — per service, in real time
3. **Detect drift statistically** — deterministic z-score analysis against a rolling baseline, with severity gating so noise never pages anyone
4. **Investigate with AI** — a ReAct agent (Claude) correlates the signal to the responsible change, explains the likely mechanism, and estimates **revenue impact per hour**
5. **Surface it for humans** — a 3-bullet VP-ready observation card, not a wall of graphs

Regression detected and explained in **~8 minutes** instead of surfacing in a 7-day review cycle.

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
┌─────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────┐
│  Change Events  │     │        Wake Backend          │     │    Wake Dashboard    │
│                 │     │        (FastAPI)              │     │    (React + Vite)    │
│ • GHE merged PRs│────▶│                              │────▶│                      │
│ • Code deploys  │     │  • Behavioral metric stream  │     │ • Live drift charts  │
│ • Config changes│     │  • Z-score drift detection   │     │ • Signal severity bar│
│ • Prompt updates│     │  • Severity gating           │     │ • Observation card   │
└─────────────────┘     │  • ReAct investigation agent │     │ • Revenue impact     │
                        │    (Claude · 4 tools)        │     │ • Prompt Pulse tab   │
                        └──────────────────────────────┘     └──────────────────────┘
```

### Detection engine

- **Deterministic z-score statistics** over per-metric baselines — same input, same answer, every time
- **Ramped confidence window**: signals require sustained deviation (fires ~minute 8 of a real regression), so a single noisy data point never alerts
- **Severity gating**: only regressions that clear the statistical threshold reach a human — ordinary metric wobble is ignored by design

### Investigation agent

When a signal fires, a **ReAct loop powered by Claude (claude-sonnet-4-5)** investigates using 4 tools and produces:

- The **responsible change event** (the merged PR)
- A plain-English **mechanism hypothesis**
- **Estimated revenue impact per hour** from `wake.config.json`
- A **3-bullet observation card** written for a VP, not an SRE

---

## Demo Scenarios

Wake ships with 7 scripted scenarios that exercise every path of the engine:

| #   | Scenario                               | Type              | Outcome                          |
| --- | -------------------------------------- | ----------------- | -------------------------------- |
| 001 | Checkout regression                    | Code deploy       | 🔴 Signals ~min 8 · ~$700K/hr    |
| 002 | Search deploy, clean                   | Code deploy       | 🟢 Never signals                 |
| 003 | Recommendations improvement            | Code deploy       | 🟢 Positive drift, no alert      |
| 004 | Cart abandonment regression            | Code deploy       | 🔴 Signals ~min 10               |
| 005 | Prompt regression                      | **Prompt update** | 🔴 Signals ~min 8 · Prompt Pulse |
| 006 | Homepage deploy, clean                 | Config            | 🟢 Never signals                 |
| 007 | Checkout **decoy** — noisy but healthy | Code deploy       | ⚪ **Never alerts** — the point  |

**Scenario 007** is the heart of the pitch: a deploy where the checkout metric dips below baseline — exactly what a threshold alert would page on. Wake stays silent because statistically, the movement is within normal variance. **No false alarms is a feature, not a gap.**

---

## What's Real vs. Simulated

- **Real**: the z-score detection engine, severity gating, ramp logic, the ReAct investigation agent, live Claude API integration, the full React dashboard, change events pulled from real merged PRs via the GitHub Enterprise API (`gecgithub01.walmart.com`)
- **Simulated**: customer behavioral metric streams, generated by a deterministic seeded simulator so demos are reproducible

The simulator is a stand-in for the event pipelines that already exist at Walmart. Swapping in a real behavioral stream changes the data source — not the engine. That's the design: **config-once, monitor always**.

---

## Quickstart

**Prerequisites**: Python 3.11+, Node 18+, Anthropic API key

```bash
# 1. Clone
git clone https://github.com/shashank9mittal/wake-cios && cd wake-cios

# 2. Backend
cd backend
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
echo "WAKE_TIME_MULTIPLIER=16" >> .env        # 30-second demo signals (set to 1 for real-time)
pip install fastapi uvicorn httpx python-dotenv
uvicorn main:app --port 8000 --reload

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev
# Dashboard at http://localhost:5173
```

**Run a demo:**

```bash
# Trigger the checkout regression scenario
curl -X POST localhost:8000/trigger/deploy-001

# Watch the dashboard — signal fires in ~30 seconds
# Click Investigate when the alert appears
```

**Reset everything:**

```bash
for id in deploy-001 deploy-002 deploy-003 deploy-004 deploy-005 deploy-006 deploy-007; do
  curl -X POST localhost:8000/reset/$id
done
# Or just restart the backend — server restart = clean slate
```

---

## Configuration

Edit `backend/wake.config.json` to point Wake at any service:

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

**Config-once, monitor always. ~15 minute setup.**

---

## API Reference

| Endpoint                 | Method | What it does                             |
| ------------------------ | ------ | ---------------------------------------- |
| `/health`                | GET    | Server health + scenarios loaded         |
| `/changes`               | GET    | All change events with current severity  |
| `/metrics/{scenario_id}` | GET    | Live behavioral metrics for a scenario   |
| `/trigger/{scenario_id}` | POST   | Start monitoring a scenario              |
| `/investigate`           | POST   | Run AI investigation on an active signal |
| `/reset/{scenario_id}`   | POST   | Reset a scenario to idle                 |
| `/config`                | GET    | Current wake.config.json values          |

---

## Tech Stack

- **Backend**: FastAPI · Python · deterministic z-score engine · hashlib-seeded scenario simulator
- **Agent**: Anthropic Claude (`claude-sonnet-4-5`) · ReAct loop · 4 custom tools
- **Frontend**: React 19 · TypeScript · Vite · Recharts
- **Change source**: GitHub Enterprise API (real merged PRs from `gecgithub01.walmart.com`)

---

## Roadmap

- Plug into real behavioral event streams (Kafka/Flink replacing the simulator)
- Auto-rollback trigger when revenue impact crosses a configurable threshold
- Slack/Teams alert delivery with the observation card inline
- Multi-service blast-radius analysis for shared-dependency deploys
- Scheduled baseline recalibration to handle organic metric drift

---

**Built by Shashank Mittal · Walmart Global Tech · CIOS Hackathon June 2026**
