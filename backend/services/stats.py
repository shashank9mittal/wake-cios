import random
import statistics
from typing import Any

METRICS = [
    "checkout_initiation_rate",
    "cart_abandonment_rate",
    "session_duration_s",
    "payment_completion_rate",
]


def compute_stats(scenario: dict, minutes_elapsed: float) -> dict:
    """
    Compute rolling z-score statistics for a triggered scenario.

    Step 1 — Pre-deploy baseline simulation:
        Generate 30 synthetic datapoints (one per minute for the 30 minutes
        before the change shipped) by sampling gaussian noise around each
        metric's known baseline mean and stddev.  These stand in for the
        rolling window a real monitoring system would have accumulated.

    Step 2 — Post-deploy datapoints:
        Generate one datapoint per minute since the change was triggered.
        The shift is applied gradually via a ramp factor that reaches 1.0
        at 15 minutes, modelling the reality that traffic-weighted impact
        builds as more sessions hit the new code path.

    Step 3 — Z-score (primary metric only):
        Compare the mean of the post-deploy window to the mean and std of
        the pre-deploy window.  Using the pre-deploy sample std (not the
        known population stddev) makes the signal more realistic — it
        would degrade gracefully if the baseline window were noisy.

    Step 4 — Severity bucketing:
        Four buckets keyed on |z|: none / watch / warning / critical.

    Step 5 — Signal detection gate:
        True when |z| >= 2.0, matching the threshold used by the agent
        to decide whether to escalate.

    Step 6 — Return payload:
        Flat fields for the primary metric plus nested dicts for all
        four metrics and the raw post-deploy datapoint lists for charting.
    """

    # ------------------------------------------------------------------ #
    # Step 1 — Pre-deploy baseline datapoints (30 minutes of history)
    # ------------------------------------------------------------------ #
    pre: dict[str, list[float]] = {}
    for m in METRICS:
        mean = scenario["baseline"][m]
        std = scenario["baseline_stddev"][m]
        pre[m] = [mean + random.gauss(0, std) for _ in range(30)]

    # ------------------------------------------------------------------ #
    # Step 2 — Post-deploy datapoints (one per elapsed minute)
    # ------------------------------------------------------------------ #
    n_post = max(1, int(minutes_elapsed))
    ramp = min(minutes_elapsed / 15.0, 1.0)

    post: dict[str, list[float]] = {}
    for m in METRICS:
        mean = scenario["baseline"][m]
        std = scenario["baseline_stddev"][m]
        shift = scenario["shift"][m]
        post[m] = [mean + (shift * ramp) + random.gauss(0, std * 0.4) for _ in range(n_post)]

    # ------------------------------------------------------------------ #
    # Step 3 — Z-score for primary metric only
    # ------------------------------------------------------------------ #
    pm = scenario["primary_metric"]

    post_mean = statistics.mean(post[pm])
    pre_mean = statistics.mean(pre[pm])
    pre_std = statistics.stdev(pre[pm])

    z_score = (post_mean - pre_mean) / pre_std if pre_std != 0 else 0.0
    z_abs = abs(z_score)

    # ------------------------------------------------------------------ #
    # Step 4 — Severity
    # ------------------------------------------------------------------ #
    if z_abs < 1.5:
        severity = "none"
    elif z_abs < 2.0:
        severity = "watch"
    elif z_abs < 2.5:
        severity = "warning"
    else:
        severity = "critical"

    # ------------------------------------------------------------------ #
    # Step 5 — Signal detection
    # ------------------------------------------------------------------ #
    outcome = scenario.get("outcome", "clean")
    signal_detected = (outcome == "regression") and (z_abs >= 2.0)

    # ------------------------------------------------------------------ #
    # Confidence (0-100) derived from |z|
    # ------------------------------------------------------------------ #
    if z_abs < 1.5:
        confidence = int(z_abs / 1.5 * 30)
    elif z_abs < 2.0:
        confidence = 30 + int((z_abs - 1.5) / 0.5 * 30)
    elif z_abs < 2.5:
        confidence = 60 + int((z_abs - 2.0) / 0.5 * 20)
    else:
        confidence = 80 + min(int((z_abs - 2.5) * 8), 19)

    # ------------------------------------------------------------------ #
    # Step 6 — Build return payload
    # ------------------------------------------------------------------ #
    all_metrics: dict[str, Any] = {}
    for m in METRICS:
        b = statistics.mean(pre[m])
        c = statistics.mean(post[m])
        d = c - b
        all_metrics[m] = {
            "baseline": round(b, 4),
            "current": round(c, 4),
            "delta": round(d, 4),
            "delta_pct": round((d / b * 100) if b != 0 else 0.0, 2),
        }

    pm_baseline = all_metrics[pm]["baseline"]
    pm_current = all_metrics[pm]["current"]
    pm_delta = all_metrics[pm]["delta"]

    return {
        "signal_detected": signal_detected,
        "z_score": round(z_score, 2),
        "severity": severity,
        "confidence": confidence,
        "primary_metric": pm,
        "primary_metric_baseline": pm_baseline,
        "primary_metric_current": pm_current,
        "primary_metric_delta": pm_delta,
        "all_metrics": all_metrics,
        "datapoints": {m: [round(v, 4) for v in post[m]] for m in METRICS},
    }
