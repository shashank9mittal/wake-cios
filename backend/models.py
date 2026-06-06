from typing import Any, Literal, Optional

from pydantic import BaseModel


# Response returned immediately when a scenario is triggered via POST /trigger/{scenario_id}
class TriggerResponse(BaseModel):
    scenario_id: str
    triggered_at: str  # ISO 8601 datetime string
    message: str


# Full statistical snapshot returned by GET /metrics/{change_id}
class MetricsResponse(BaseModel):
    scenario_id: str
    minutes_elapsed: float
    signal_detected: bool
    z_score: float
    severity: Literal["none", "watch", "warning", "critical"]
    confidence: int
    primary_metric: str
    primary_metric_baseline: float
    primary_metric_current: float
    primary_metric_delta: float
    all_metrics: dict[str, Any]   # keyed by metric name → {baseline, current, delta, delta_pct}
    datapoints: dict[str, Any]    # keyed by metric name → list[float]


# Request body for POST /analyze — caller specifies which scenario and how far along it is
class AnalyzeRequest(BaseModel):
    scenario_id: str
    minutes_elapsed: float


# Single entry in the GET /changes list; status and severity are computed server-side
class ChangeEvent(BaseModel):
    id: str
    name: str
    service: str
    engineer: str
    team: str
    surface: str
    change_type: str
    change_artifact: str
    primary_metric: str
    deployed_at: Optional[str]    # None until scenario is triggered
    outcome: str
    affected_segment: str
    status: str                   # "idle" | "watching" | "warning" | "critical"
    severity: str                 # mirrors MetricsResponse.severity once triggered


# Request body for POST /investigate — passes the full stats payload so the agent
# has all context without needing to re-fetch metrics
class InvestigateRequest(BaseModel):
    scenario_id: str
    stats: dict[str, Any]         # serialized MetricsResponse


# Structured findings returned by the ReAct investigation agent
class InvestigateResponse(BaseModel):
    signal_detected: bool
    confidence: int
    affected_segment: str
    likely_causes: list[dict[str, Any]]   # each entry: {cause, evidence, confidence_pct}
    plain_english: str                    # one-paragraph summary for non-technical readers
    revenue_impact_per_hour: float
    recommendation: str
    severity: Literal["none", "watch", "warning", "critical"]
