# Wake — Customer Impact Observability

## What this project is
A hackathon project for Walmart Global Tech Hackathon 2025.
Detects customer behavioral regressions within minutes of any
change shipping — code, config, or AI prompt.

## Stack
- Frontend: React + Vite + TypeScript + Recharts
- Backend: FastAPI (Python)
- AI: Anthropic Claude API
- Data: scenarios.json (in-memory, no database)

## Key files
- backend/data/scenarios.json — all synthetic scenario data
- backend/services/stats.py — rolling baseline + z-score engine
- backend/services/agent.py — investigation agent ReAct loop
- backend/main.py — FastAPI app with 5 endpoints

## Rules
- Never use a database — everything in-memory from scenarios.json
- Never hardcode outcomes — all detection emerges from z-scores
- The decoy scenario (id: deploy-007) MUST return signal_detected=false
- Agent tools are ALL read-only — no writes, no auto-actions
- Backend runs on port 8000, frontend on port 5173

## API endpoints
GET  /changes
GET  /metrics/{change_id}
POST /trigger/{scenario_id}
POST /analyze
POST /investigate

## Current focus
Building scenarios.json first. Then stats.py. Then agent.py.
Do not touch frontend until backend is working.
