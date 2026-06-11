import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from services.stats import compute_stats

SCENARIOS = {s["id"]: s for s in json.loads(
    (Path(__file__).parent / "data" / "scenarios.json").read_text())}

def first_fire(sid, max_min=60):
    for m in range(1, max_min + 1):
        if compute_stats(SCENARIOS[sid], m)["signal_detected"]:
            return m
    return None

def test_determinism():
    assert compute_stats(SCENARIOS["deploy-001"], 10) == compute_stats(SCENARIOS["deploy-001"], 10)

def test_decoy_never_fires():
    assert first_fire("deploy-007") is None

def test_positive_drift_statistically_significant_but_suppressed():
    s = compute_stats(SCENARIOS["deploy-003"], 20)
    assert s["z_score"] >= 2.0          # the movement is real...
    assert not s["signal_detected"]     # ...but it's an improvement, so no alert
    assert first_fire("deploy-003") is None

def test_clean_scenarios_silent():
    assert first_fire("deploy-002") is None
    assert first_fire("deploy-006") is None

def test_regression_timings():
    assert first_fire("deploy-001") == 10
    assert first_fire("deploy-004") == 10
    assert first_fire("deploy-005") == 8   # flagship: matches the "8 minutes" headline
