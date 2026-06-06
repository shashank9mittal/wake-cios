import os
import json
import httpx
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")

SYSTEM_PROMPT = """You are Wake, a customer impact observability system for Walmart.
You receive statistical analysis of customer behavioral metrics
after a change shipped. Your job is to interpret the data and
return a structured JSON diagnosis.

CRITICAL RULES:
- If signal_detected is false: you MUST return severity 'none',
  revenue_impact_per_hour 0, and recommendation 'No action needed. Deploy looks clean.'
- Never invent behavioral causes not supported by the stats
- Revenue formula: abs(delta_pct) / 100 * 0.31 * 26000 * 60 * 47
  (checkout_conversion_rate * sessions_per_min * mins_per_hr * avg_order_value)
- Be direct. One clear recommendation. No hedging.

Return ONLY valid JSON matching this exact schema:
{
  "signal_detected": bool,
  "confidence": int,
  "affected_segment": str,
  "likely_causes": [{"cause": str, "evidence": str, "confidence_pct": int}],
  "plain_english": str,
  "revenue_impact_per_hour": float,
  "recommendation": str,
  "severity": str
}"""

FALLBACK = {
    "signal_detected": False,
    "confidence": 0,
    "affected_segment": "Unknown",
    "likely_causes": [],
    "plain_english": "Analysis unavailable",
    "revenue_impact_per_hour": 0.0,
    "recommendation": "Unable to analyze — check API key",
    "severity": "none",
}


async def analyze_with_claude(scenario: dict, stats: dict) -> dict:
    """Call Claude to interpret z-score stats and return a structured diagnosis dict."""

    # ------------------------------------------------------------------ #
    # Build user message — readable labeled text, not raw JSON
    # ------------------------------------------------------------------ #
    all_metrics_lines = "\n".join(
        f"  {name}: baseline={v['baseline']}, current={v['current']}, "
        f"delta={v['delta']}, delta_pct={v['delta_pct']}%"
        for name, v in stats.get("all_metrics", {}).items()
    )

    user_message = f"""CHANGE DETAILS
Name:            {scenario['name']}
Service:         {scenario['service']}
Change type:     {scenario['change_type']}
Change artifact: {scenario['change_artifact']}
Context:         {scenario['context_for_claude']}

STATISTICAL SIGNAL
signal_detected: {stats['signal_detected']}
z_score:         {stats['z_score']}
severity:        {stats['severity']}
confidence:      {stats['confidence']}

PRIMARY METRIC ({stats['primary_metric']})
  baseline:  {stats['primary_metric_baseline']}
  current:   {stats['primary_metric_current']}
  delta:     {stats['primary_metric_delta']}

ALL METRICS
{all_metrics_lines}

AFFECTED SEGMENT
{scenario['affected_segment']}"""

    # ------------------------------------------------------------------ #
    # Call Anthropic API via httpx
    # ------------------------------------------------------------------ #
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": os.getenv("ANTHROPIC_API_KEY", ""),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-5",
                    "max_tokens": 1024,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
            response.raise_for_status()
    except Exception:
        return FALLBACK

    # ------------------------------------------------------------------ #
    # Parse response — strip markdown fences if present
    # ------------------------------------------------------------------ #
    try:
        text = response.json()["content"][0]["text"]
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]  # drop opening fence + language tag
            if text.startswith("json"):
                text = text[4:]
            text = text.rsplit("```", 1)[0].strip()  # drop closing fence
        return json.loads(text)
    except Exception:
        return FALLBACK
