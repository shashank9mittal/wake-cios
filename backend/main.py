from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import asyncio
import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from services.stats import compute_stats
from services.ghe import fetch_latest_merged_pr
from models import (
    TriggerResponse,
    MetricsResponse,
    ChangeEvent,
    InvestigateRequest,
    InvestigateResponse,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_last_seen_pr()  # pre-seed, no trigger
    task = asyncio.create_task(poll_ghe_background())
    yield
    task.cancel()


app = FastAPI(title="Wake — Customer Impact Observability", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

from config import CONFIG

DATA_PATH = Path(__file__).parent / "data" / "scenarios.json"
raw = json.loads(DATA_PATH.read_text())
SCENARIOS: dict[str, dict] = {s["id"]: s for s in raw}
TRIGGERED: dict[str, datetime | None] = {sid: None for sid in SCENARIOS}

# GHE live deploy tracking
LAST_SEEN_PR: int | None = None
DEMO_STATE = {"prompt_version": "concise"}

# Speed multiplier for demos. Default 1.0 = real time (signal ~8 min).
# Set WAKE_TIME_MULTIPLIER=16 in .env for a 30-second demo signal.
# Set WAKE_TIME_MULTIPLIER=1 to restore realistic timing before production.
TIME_MULTIPLIER = float(os.getenv("WAKE_TIME_MULTIPLIER", "1.0"))

# ---------------------------------------------------------------------------
# GHE polling helpers (defined after SCENARIOS/TRIGGERED are initialized)
# ---------------------------------------------------------------------------

async def check_latest_pr() -> dict:
    """Core GHE poll logic shared by the background task and /latest-deploy endpoint."""
    global LAST_SEEN_PR, DEMO_STATE
    pr = await fetch_latest_merged_pr()
    if not pr:
        return {"status": "no_pr_found"}

    if pr["pr_number"] != LAST_SEEN_PR:
        LAST_SEEN_PR = pr["pr_number"]

        # Idempotency: skip if already processed (e.g. after backend restart)
        if pr["id"] in SCENARIOS:
            return {"status": "already_processed", "pr": pr}

        if pr["change_type"] == "prompt":
            DEMO_STATE["prompt_version"] = "conversational"
            new_scenario = dict(SCENARIOS["deploy-005"])
            new_scenario["id"] = pr["id"]
            new_scenario["name"] = f"PR #{pr['pr_number']}: {pr['name']}"
            new_scenario["engineer"] = pr["engineer"]
            new_scenario["service"] = pr["service"]
            new_scenario["change_artifact"] = f"PR #{pr['pr_number']} merged into {pr.get('base_branch', 'main')}"
            SCENARIOS[pr["id"]] = new_scenario
            TRIGGERED[pr["id"]] = datetime.now(timezone.utc)

        elif pr["change_type"] == "config":
            DEMO_STATE["prompt_version"] = "concise"

        return {"status": "new_deploy_detected", "pr": pr,
                "auto_triggered": pr["change_type"] == "prompt"}

    return {"status": "no_new_deploy", "pr": pr}


async def initialize_last_seen_pr():
    try:
        pr = await fetch_latest_merged_pr()
        if pr:
            global LAST_SEEN_PR
            LAST_SEEN_PR = pr["pr_number"]
            # Rebuild scenario in memory if it was previously processed
            if pr["change_type"] == "prompt" and pr["id"] not in SCENARIOS:
                new_scenario = dict(SCENARIOS["deploy-005"])
                new_scenario["id"] = pr["id"]
                new_scenario["name"] = f"PR #{pr['pr_number']}: {pr['name']}"
                new_scenario["engineer"] = pr["engineer"]
                new_scenario["service"] = pr["service"]
                new_scenario["change_artifact"] = f"PR #{pr['pr_number']} merged into {pr.get('base_branch', 'main')}"
                SCENARIOS[pr["id"]] = new_scenario
                TRIGGERED[pr["id"]] = datetime.fromisoformat(
                    pr["merged_at"].replace("Z", "+00:00")
                )
                DEMO_STATE["prompt_version"] = "conversational"
                print(f"Startup: rebuilt scenario {pr['id']} from merged PR")
            print(f"Startup: LAST_SEEN_PR initialized to {LAST_SEEN_PR}")
    except Exception as e:
        print(f"Startup PR init error: {e}")


async def poll_ghe_background():
    while True:
        await asyncio.sleep(10)
        try:
            await check_latest_pr()
        except Exception as e:
            print(f"GHE poll error: {e}")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/config")
def get_config():
    return CONFIG


@app.get("/health")
async def health():
    """Liveness check — confirms the service is up and scenarios are loaded."""
    return {"status": "ok", "scenarios_loaded": len(SCENARIOS)}


@app.get("/changes", response_model=list[ChangeEvent])
async def get_changes():
    """Return every scenario as a ChangeEvent, with live status if triggered."""
    events: list[ChangeEvent] = []
    for sid, scenario in SCENARIOS.items():
        triggered_at = TRIGGERED[sid]
        if triggered_at is None:
            status = "idle"
            severity = "none"
            deployed_at = None
        else:
            minutes_elapsed = (
                (datetime.now(timezone.utc) - triggered_at).total_seconds()
                / 60.0
                * TIME_MULTIPLIER
            )
            stats = compute_stats(scenario, minutes_elapsed)
            raw_severity = stats["severity"]
            outcome = scenario.get("outcome", "clean")
            severity = raw_severity if outcome == "regression" else "none"
            status = severity if severity != "none" else "watching"
            deployed_at = triggered_at.isoformat()

        events.append(
            ChangeEvent(
                id=scenario["id"],
                name=scenario["name"],
                service=scenario["service"],
                engineer=scenario["engineer"],
                team=scenario["team"],
                surface=scenario["surface"],
                change_type=scenario["change_type"],
                change_artifact=scenario["change_artifact"],
                primary_metric=scenario["primary_metric"],
                deployed_at=deployed_at,
                affected_segment=scenario["affected_segment"],
                status=status,
                severity=severity,
            )
        )
    return events


@app.get("/latest-deploy")
async def get_latest_deploy():
    try:
        return await check_latest_pr()
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/demo-state")
def get_demo_state():
    return DEMO_STATE


@app.get("/metrics/{change_id}", response_model=MetricsResponse)
async def get_metrics(change_id: str):
    """Return live z-score statistics for a triggered scenario."""
    if change_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{change_id}' not found")
    if TRIGGERED[change_id] is None:
        raise HTTPException(status_code=400, detail="Scenario not yet triggered")

    scenario = SCENARIOS[change_id]
    minutes_elapsed = (
        (datetime.now(timezone.utc) - TRIGGERED[change_id]).total_seconds()
        / 60.0
        * TIME_MULTIPLIER
    )

    stats = compute_stats(scenario, minutes_elapsed)

    return MetricsResponse(
        scenario_id=change_id,
        minutes_elapsed=round(minutes_elapsed, 2),
        **stats,
    )


@app.post("/trigger/{scenario_id}", response_model=TriggerResponse)
async def trigger_scenario(scenario_id: str):
    """Mark a scenario as deployed now and begin monitoring the clock."""
    if scenario_id not in SCENARIOS:
        raise HTTPException(
            status_code=404, detail=f"Scenario '{scenario_id}' not found"
        )

    now = datetime.now(timezone.utc)
    TRIGGERED[scenario_id] = now

    name = SCENARIOS[scenario_id]["name"]
    return TriggerResponse(
        scenario_id=scenario_id,
        triggered_at=now.isoformat(),
        message=f"Scenario {name} triggered. Wake is now monitoring.",
    )


@app.post("/investigate", response_model=InvestigateResponse)
async def investigate(body: InvestigateRequest):
    """Run the ReAct investigation agent and return a structured diagnosis."""
    if body.scenario_id not in SCENARIOS:
        raise HTTPException(
            status_code=404, detail=f"Scenario '{body.scenario_id}' not found"
        )

    scenario = SCENARIOS[body.scenario_id]

    from services.agent import run_investigation

    result = await run_investigation(scenario, body.stats)

    SEVERITY_MAP = {
        "high": "critical",
        "medium": "warning",
        "low": "watch",
        "none": "none",
        "watch": "watch",
        "warning": "warning",
        "critical": "critical",
    }

    if isinstance(result, dict):
        result["severity"] = SEVERITY_MAP.get(result.get("severity", "none"), "none")

    SEGMENT_PCT = {
        "Mobile iOS": 0.31,
        "All users": 1.0,
        "None": 0.0,
    }
    pct = SEGMENT_PCT.get(scenario.get("affected_segment", "None"), 0.0)
    result["affected_users_count"] = int(CONFIG["sessions_per_minute"] * 60 * pct)

    return result


@app.post("/reset/{scenario_id}")
async def reset_scenario(scenario_id: str):
    """Clear the trigger timestamp for a scenario so it can be re-triggered in demos."""
    if scenario_id not in SCENARIOS:
        raise HTTPException(
            status_code=404, detail=f"Scenario '{scenario_id}' not found"
        )

    TRIGGERED[scenario_id] = None
    return {"message": "Reset complete"}
