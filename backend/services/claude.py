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
- Revenue formula: abs(delta_pct) / 100 * 0.342 * 26000 * 0.31 * 47 * 60
  This gives approximately $77,734 per 1 percentage point drop.
  For a 2% drop: ~$155K/hr. For a 3% drop: ~$233K/hr.
  These are realistic Walmart-scale numbers.
- Be direct. One clear recommendation. No hedging.

Return ONLY valid JSON matching this exact schema:
{
  "signal_detected": bool,
  "confidence": int,
  "affected_segment": str,
  "likely_causes": [
    {"cause": str, "evidence": str, "confidence_pct": int}
  ],
  "plain_english": str,
  "summary_bullets": [
    "**Key insight 1**: explanation in plain English for a VP",
    "**Key insight 2**: what the pattern means across all metrics",
    "**Confidence note**: why to trust or not trust this signal"
  ],
  "revenue_impact_per_hour": float,
  "recommendation": str,
  "severity": str — must be exactly one of: none, watch, warning, critical
}

- summary_bullets must always have exactly 3 strings
- Each string starts with **bold key point** followed by explanation
- Write for a non-technical VP audience — no jargon
- If signal_detected is false: all 3 bullets explain why metrics look normal and no action needed"""

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


async def generate_summary_bullets(
    scenario: dict,
    stats: dict,
    investigation: dict
) -> list[str]:
    """Generate 3 plain-English summary bullets for VP audience."""

    prompt = f"""You are summarizing a deployment investigation for a VP audience.

Change: {scenario['name']} ({scenario['change_type']})
Service: {scenario['service']}

Key findings:
- Signal detected: {investigation['signal_detected']}
- Affected: {investigation['affected_segment']}
- Primary metric delta: {stats['primary_metric_delta']*100:.1f}%
- Confidence: {investigation['confidence']}%
- Revenue impact: ${investigation['revenue_impact_per_hour']:,.0f}/hr

Write exactly 3 bullet points for a VP who doesn't know engineering.
Each bullet starts with **2-4 word bold title**: then explanation.

Bullet 1: What happened across all metrics together
Bullet 2: What this means for customers right now
Bullet 3: Why we trust or don't trust this signal

Return ONLY a JSON array with exactly 3 strings. Nothing else.
Example format:
["**3 metrics declining**: checkout, abandonment and payment all moved together pointing to one root cause.",
 "**Customers are stuck**: iPhone users cannot find the submit button after the payment form redesign.",
 "**High confidence signal**: z-score of 3.8 with 95% confidence means this is real, not random noise."]"""

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
                    "max_tokens": 400,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            text = response.json()["content"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.rsplit("```")[0].strip()
            bullets = json.loads(text)
            if isinstance(bullets, list) and len(bullets) == 3:
                return bullets
            return []
    except Exception:
        return []
