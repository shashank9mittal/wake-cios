from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import json, os, random
from pathlib import Path
from services.stats import compute_stats
from models import (TriggerResponse, MetricsResponse, AnalyzeRequest,
                    ChangeEvent, InvestigateRequest, InvestigateResponse)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Wake — Customer Impact Observability")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

DATA_PATH = Path(__file__).parent / "data" / "scenarios.json"
raw = json.loads(DATA_PATH.read_text())
SCENARIOS: dict[str, dict] = {s["id"]: s for s in raw}
TRIGGERED: dict[str, datetime | None] = {sid: None for sid in SCENARIOS}

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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
            minutes_elapsed = (datetime.now(timezone.utc) - triggered_at).total_seconds() / 60.0
            stats = compute_stats(scenario, minutes_elapsed)
            raw_severity = stats["severity"]
            outcome = scenario.get("outcome", "clean")
            severity = raw_severity if outcome == "regression" else "none"
            status = severity if severity != "none" else "watching"
            deployed_at = triggered_at.isoformat()

        events.append(ChangeEvent(
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
            outcome=scenario["outcome"],
            affected_segment=scenario["affected_segment"],
            status=status,
            severity=severity,
        ))
    return events


@app.get("/metrics/{change_id}", response_model=MetricsResponse)
async def get_metrics(change_id: str):
    """Return live z-score statistics for a triggered scenario."""
    if change_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{change_id}' not found")
    if TRIGGERED[change_id] is None:
        raise HTTPException(status_code=400, detail="Scenario not yet triggered")

    scenario = SCENARIOS[change_id]
    minutes_elapsed = (
        datetime.now(timezone.utc) - TRIGGERED[change_id]
    ).total_seconds() / 60.0

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
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    now = datetime.now(timezone.utc)
    TRIGGERED[scenario_id] = now

    name = SCENARIOS[scenario_id]["name"]
    return TriggerResponse(
        scenario_id=scenario_id,
        triggered_at=now.isoformat(),
        message=f"Scenario {name} triggered. Wake is now monitoring.",
    )


@app.post("/analyze")
async def analyze(body: AnalyzeRequest):
    """Run Claude analysis on a triggered scenario and return structured findings."""
    if body.scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{body.scenario_id}' not found")
    if TRIGGERED[body.scenario_id] is None:
        raise HTTPException(status_code=400, detail="Scenario not yet triggered")

    scenario = SCENARIOS[body.scenario_id]
    minutes_elapsed = body.minutes_elapsed
    stats = compute_stats(scenario, minutes_elapsed)

    from services.claude import analyze_with_claude
    result = await analyze_with_claude(scenario, stats)
    return result


@app.post("/investigate", response_model=InvestigateResponse)
async def investigate(body: InvestigateRequest):
    """Run the ReAct investigation agent and return a structured diagnosis."""
    if body.scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{body.scenario_id}' not found")

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
        result["severity"] = SEVERITY_MAP.get(
            result.get("severity", "none"), "none"
        )

    from services.claude import generate_summary_bullets

    if isinstance(result, dict) and result.get("signal_detected"):
        bullets = await generate_summary_bullets(scenario, body.stats, result)
        if bullets:
            result["summary_bullets"] = bullets

    return result


@app.post("/reset/{scenario_id}")
async def reset_scenario(scenario_id: str):
    """Clear the trigger timestamp for a scenario so it can be re-triggered in demos."""
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    TRIGGERED[scenario_id] = None
    return {"message": "Reset complete"}
