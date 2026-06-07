# Wake — Customer Impact Observability

> **Walmart loses $340,000 an hour when a deploy quietly breaks customer behavior. Wake finds it in 8 minutes — not 7 days.**

Wake correlates **change events** (code deploys, config changes, AI prompt updates) with **real-time customer behavioral metrics**, and uses statistical drift detection + an AI investigation agent to tell you _what broke, why, and what it's costing you_ — minutes after the change ships.

<!-- PLACEHOLDER: Demo video -->
<!-- 60–90 second screen recording of the 3-act demo: decoy → regression alert → live AI investigation. Embed as a GIF or link to video. -->

[![Wake Demo Video](docs/demo-thumbnail.png)](docs/wake-demo.mp4)

---

## The Problem

Today, when a deploy silently degrades customer behavior — checkout conversion dips, cart abandonment creeps up — nobody finds out from the dashboards. They find out from a **weekly business review, up to 7 days later**, after someone asks "why is conversion down?"

Why? Because the tools we have answer the wrong questions:

| Tool                    | Answers                                 | Doesn't answer                         |
| ----------------------- | --------------------------------------- | -------------------------------------- |
| APM / Splunk / Grafana  | "Is the service healthy?"               | "Are customers behaving differently?"  |
| A/B testing platforms   | "Which variant wins?" (planned changes) | "Did this _unplanned_ deploy hurt us?" |
| Weekly business reviews | "What happened last week?"              | Anything in real time                  |

A deploy can be **technically green and behaviorally broken**. 200s across the board, latency flat — and checkout conversion down 12%. That gap is where the $340K/hour lives.

## The Solution

Wake closes the loop between _changes_ and _customer behavior_:

1. **Ingest change events** — deploys, config flips, AI prompt updates (pulled from GitHub Enterprise PRs)
2. **Watch behavioral metrics** — conversion rate, cart abandonment, search CTR, session depth — per service, in real time
3. **Detect drift statistically** — deterministic z-score analysis against a learned baseline, with severity gating so noise never pages anyone
4. **Investigate with AI** — a ReAct agent (Claude) correlates the signal to the responsible change, explains the likely mechanism, and estimates **revenue impact per hour**
5. **Surface it for humans** — a 3-bullet VP-ready observation card, not a wall of graphs

The result: regression detected and explained in **~8 minutes** instead of surfacing in a 7-day review cycle.

### What makes Wake different

- **Behavior-first, not infra-first.** Wake doesn't care if your pods are healthy. It cares if your customers stopped checking out.
- **Noise-immune by design.** Statistical severity gating means ordinary metric wobble never alerts. Wake knows the difference between drift and a regression. (See scenario 007 below — the decoy.)
- **AI changes are first-class changes.** A prompt update to an AI feature is a deploy. **Prompt Pulse** monitors behavioral impact of LLM prompt changes with the same engine that watches code deploys.
- **Explains, not just alerts.** The investigation agent answers the three questions an on-call human asks: _what changed, what broke, what does it cost._

---

## How It Works

<!-- PLACEHOLDER: Architecture diagram -->
<!-- Diagram showing: GHE PRs + change events → FastAPI backend (z-score engine, scenario simulator) → ReAct agent (Claude, 4 tools) → React dashboard (metric cards, drift chart, signal bar, observation card, Prompt Pulse) -->

![Wake Architecture](docs/architecture.png)

```
┌─────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────┐
│  Change Events  │     │        Wake Backend          │     │    Wake Dashboard    │
│                 │     │        (FastAPI)             │     │    (React + Vite)    │
│ • GHE merged PRs│────▶│                              │────▶│                      │
│ • Deploys       │     │  • Behavioral metric stream  │     │ • Live drift charts  │
│ • Config changes│     │  • Z-score drift detection   │     │ • Signal severity bar│
│ • Prompt updates│     │  • Severity gating           │     │ • Observation card   │
└─────────────────┘     │  • ReAct investigation agent │     │ • Revenue impact     │
                        │    (Claude · 4 tools)        │     │ • Prompt Pulse       │
                        └──────────────────────────────┘     └──────────────────────┘
```

### Detection engine

- **Deterministic z-score statistics** over per-metric baselines — same input, same answer, every time. No flaky ML black box.
- **Ramped confidence window**: signals require sustained deviation (fires around minute 8–10 of a real regression), so a single bad data point never alerts.
- **Severity gating**: drift is classified before anything surfaces; only regressions that clear the threshold reach a human.

### Investigation agent

When a signal fires, a **ReAct loop powered by Claude (claude-sonnet-4-5)** investigates using 4 tools — it pulls the recent change timeline, inspects the affected metrics, correlates timing, and produces:

- The **responsible change event** (e.g., the merged PR)
- A plain-English **mechanism hypothesis** ("checkout payment validation change correlates with conversion drop starting minute 3 post-deploy")
- **Estimated revenue impact per hour**
- A **3-bullet observation card** written for a VP, not an SRE

---

## Demo Scenarios

Wake ships with 7 scripted scenarios that exercise every path of the engine:

| #   | Scenario                               | Change type       | Outcome                              |
| --- | -------------------------------------- | ----------------- | ------------------------------------ |
| 001 | Checkout regression                    | Code deploy       | 🔴 Signals ~min 8 · ~$700K/hr impact |
| 002 | Search deploy, clean                   | Code deploy       | 🟢 Never signals                     |
| 003 | Recommendations improvement            | Code deploy       | 🟢 Positive drift, never alerts      |
| 004 | Cart abandonment regression            | Code deploy       | 🔴 Signals ~min 10                   |
| 005 | Prompt regression                      | **Prompt update** | 🔴 Signals ~min 8 · Prompt Pulse     |
| 006 | Homepage deploy, clean                 | Code deploy       | 🟢 Never signals                     |
| 007 | Checkout **decoy** — noisy but healthy | Code deploy       | ⚪ **Never alerts** — the point      |

Scenario 007 is the heart of the pitch: a deploy with noisy-looking metrics that a naive threshold alert would page on. Wake stays silent — because statistically, nothing is wrong. **No false alarms is a feature, not a gap.**

<!-- PLACEHOLDER: Screenshot — dashboard with active regression -->
<!-- Full dashboard view during scenario 001: red signal bar, drift chart showing the drop, observation card with 3 bullets and $/hr impact -->

![Dashboard during regression](docs/screenshot-regression.png)

<!-- PLACEHOLDER: Screenshot — Prompt Pulse tab -->
<!-- Prompt Pulse view during scenario 005 showing prompt change as the correlated change event -->

![Prompt Pulse](docs/screenshot-prompt-pulse.png)

---

## What's real vs. simulated

We're upfront about this, because it matters:

- **Real**: the detection engine (z-score statistics, severity gating, ramp logic), the ReAct investigation agent and its tool calls, the live Claude API integration, the full dashboard, and **change events pulled from real merged PRs via the GitHub Enterprise API** (`gecgithub01`).
- **Simulated**: the customer behavioral metric streams, generated by a deterministic seeded simulator (per-point seeded RNG) so demos are reproducible.

The simulator is a stand-in for the event pipelines that already exist at Walmart. Swapping in a real behavioral stream changes the data source — not the engine. That's the design: **config-once, monitor always** — point `wake.config.json` at a service's metrics and change feed, and Wake does the rest.

---

## Quickstart

Prereqs: Python 3.11+, Node 18+, an Anthropic API key.

```bash
git clone https://github.com/shashank9mittal/wake-cios && cd wake-cios
echo "ANTHROPIC_API_KEY=sk-..." > backend/.env        # add TIME_MULTIPLIER=16 for 30-sec demo signals
cd backend && pip install -r requirements.txt && uvicorn main:app --port 8000 &
cd ../frontend && npm install && npm run dev           # dashboard at http://localhost:5173
```

Then trigger a scenario:

```bash
curl -X POST localhost:8000/trigger -d '{"scenario": "001"}' -H "Content-Type: application/json"
```

Watch the dashboard. The checkout regression signals in ~30 seconds (with `TIME_MULTIPLIER=16`; ~8 minutes at real-time speed). Hit **Investigate** when the signal fires.

### API

| Endpoint            | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `GET /changes`      | Recent change events (deploys, PRs, prompt updates) |
| `GET /metrics`      | Live behavioral metrics per service                 |
| `POST /trigger`     | Start a scenario                                    |
| `POST /investigate` | Run the AI investigation agent on an active signal  |
| `POST /reset`       | Reset simulation state                              |

---

## Tech Stack

- **Backend**: FastAPI · Python · deterministic z-score engine · seeded scenario simulator
- **Agent**: Anthropic Claude (claude-sonnet-4-5) · ReAct loop · 4 custom tools
- **Frontend**: React · TypeScript · Vite · Recharts
- **Change source**: GitHub Enterprise API (real merged PRs as change events)

---

## Roadmap

- Plug into real behavioral event streams (replacing the simulator)
- Auto-rollback recommendation when impact crosses a revenue threshold
- Slack/Teams alert delivery with the observation card inline
- Multi-service blast-radius analysis for shared-dependency changes

---

<!-- PLACEHOLDER: Team section -->
<!-- Team name (match wake.config.json header), member names/roles -->

**Team**: _[team name]_ · Built for the Walmart CIOS Hackathon, June 2026
