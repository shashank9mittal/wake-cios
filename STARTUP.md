# Wake — How to Run

## Prerequisites
- Python 3.11+
- Node 18+
- Anthropic API key (get one at console.anthropic.com)

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
pip install fastapi uvicorn httpx python-dotenv pydantic
```

Create the `.env` file:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE" > .env
echo "TIME_MULTIPLIER=16" >> .env
```

> `TIME_MULTIPLIER=16` = 30-second demo signals
> `TIME_MULTIPLIER=1`  = realistic 8-minute signals

Start the backend:
```bash
uvicorn main:app --port 8000 --reload
```

Backend runs at: http://localhost:8000
Health check: http://localhost:8000/health
swagger: http://127.0.0.1:8000/docs

---

## Step 3 — Frontend setup (new terminal)
```bash
cd wake-cios/frontend
npm install
npm run dev
```

Dashboard runs at: http://localhost:5173

---

## Step 4 — Run a demo

Open http://localhost:5173, click any scenario in the sidebar, click **Simulate Deploy**.

Or trigger via curl:
```bash
# Checkout regression — signals in ~30 seconds
curl -X POST localhost:8000/trigger/deploy-001

# Prompt regression — shows in Prompt Pulse tab
curl -X POST localhost:8000/trigger/deploy-005

# Decoy — never alerts (the point)
curl -X POST localhost:8000/trigger/deploy-007
```

Reset everything:
```bash
for id in 001 002 003 004 005 006 007; do
  curl -X POST localhost:8000/reset/deploy-$id
done
```

> Restarting the backend also resets all scenarios automatically.

---

## Scenario reference

| ID | Name | Expected |
|---|---|---|
| deploy-001 | Checkout regression | 🔴 Alert ~30s · ~$700K/hr |
| deploy-002 | Search clean | 🟢 Never alerts |
| deploy-003 | Recommendations positive | 🟢 Never alerts |
| deploy-004 | Cart abandonment regression | 🔴 Alert ~40s |
| deploy-005 | Prompt regression | 🔴 Alert ~30s · Prompt Pulse |
| deploy-006 | Homepage clean | 🟢 Never alerts |
| deploy-007 | Checkout decoy | ⚪ Never alerts (noisy but healthy) |
