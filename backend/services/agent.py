import os
import json
import asyncio
import httpx
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")
from config import CONFIG

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

SYSTEM_PROMPT = """You are Wake's investigation agent for Walmart engineering.
A behavioral signal has been detected after a change shipped.
Use the available tools to gather evidence, then produce a final diagnosis.

Investigation process:
1. Call get_change_timeline to see ALL changes near the signal. Do not assume
   the named change is responsible — identify the culprit by matching deploy
   timing to drift onset AND surface to where the metric dropped.
2. Call get_segment_breakdown to see which users are hit. A single-segment
   (e.g. iOS-only) impact points to a client/layout cause; a broad impact
   points to a backend cause.
3. Call get_change_artifact for the suspected culprit and infer the mechanism
   from the raw diff plus the segment pattern — do not expect it to be
   explained to you.
4. Call get_surface_map and get_similar_incidents to corroborate.
5. State, in likely_causes and plain_english, WHY you ruled out the other
   changes in the timeline and what evidence pins the one you chose.

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

CRITICAL RULES:
- summary_bullets must always have exactly 3 strings
- Each string starts with **bold key point** followed by explanation
- Write for a non-technical VP audience — no jargon
- If signal_detected is false: all 3 bullets explain why metrics look normal and no action needed
- Revenue formula: abs(delta_pct) / 100 * 0.342 * 26000 * 0.31 * 47 * 60
  At 9% drop: ~$700K/hr. At 8% drop: ~$622K/hr. At 3% drop: ~$233K/hr.
  Always compute from the actual delta_pct you observe. Do not round to a fixed number.
- If signal_detected is false in the stats you received,
  your final JSON MUST have signal_detected=false, severity='none',
  revenue_impact_per_hour=0, recommendation='No action needed.'
- If primary_metric_delta is POSITIVE (checkout going UP),
  this is a POSITIVE outcome. Set severity to 'none',
  signal_detected to false, and revenue_impact_per_hour
  to 0. The plain_english should explain the improvement
  but the alert system should NOT fire for positive changes.
  Recommendation should be: 'No action needed. Monitor for
  24-48 hours to confirm stability.'

Output ONLY the final JSON. No other text after the JSON."""

SYSTEM_PROMPT = SYSTEM_PROMPT.replace(
    "26000", str(CONFIG["sessions_per_minute"])
).replace(
    "* 47 *", f"* {CONFIG['revenue_per_session']} *"
)

TOOLS = [
    {
        "name": "get_change_timeline",
        "description": "Get all changes deployed in the ~15 minutes around the behavioral signal, across all services, with deploy time offsets and affected surfaces. Use this to correlate WHICH change is responsible by timing and surface overlap.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_change_artifact",
        "description": (
            "Retrieve the full change artifact — diff summary, "
            "commit message, or prompt diff — for the triggered change"
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_segment_breakdown",
        "description": (
            "Get behavioral metric breakdown by user segment "
            "(Mobile iOS, Mobile Android, Desktop)"
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_surface_map",
        "description": (
            "Get the list of UI surfaces and API endpoints "
            "affected by this change"
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_similar_incidents",
        "description": (
            "Search historical incidents for similar behavioral "
            "patterns on this service"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "service": {
                    "type": "string",
                    "description": "service name to search",
                }
            },
            "required": ["service"],
        },
    },
]


def handle_tool(tool_name: str, tool_input: dict, scenario: dict, stats: dict) -> str:
    """Return realistic synthetic data for each read-only investigation tool."""

    if tool_name == "get_change_timeline":
        culprit_surface = scenario["surface"]
        culprit_service = scenario["service"]
        return (
            "Changes deployed in the last 15 minutes (signal drift began at T-3min):\n\n"
            f"[T-12min] search-api · surface: search-results · code deploy\n"
            f"          'Async result prefetch' — backend only, no UI change\n\n"
            f"[T-9min]  homepage-service · surface: homepage · config change\n"
            f"          'Hero banner CDN path swap' — image URL only, same layout\n\n"
            f"[T-3min]  {culprit_service} · surface: {culprit_surface} · {scenario['change_type']} change\n"
            f"          '{scenario['name']}' — deployed 3 min before drift onset\n\n"
            "Note: the behavioral drop is concentrated on the surface where checkout "
            "originates. Correlate surface + timing + segment to attribute."
        )

    if tool_name == "get_change_artifact":
        return (
            f"Raw change:\n{scenario['change_artifact']}\n\n"
            f"Type: {scenario['change_type']}\n"
            f"Surface: {scenario['surface']}\n"
            f"Engineer: {scenario['engineer']} · Team: {scenario['team']}\n"
            f"(No impact analysis attached — infer the mechanism from the diff "
            f"and the segment breakdown.)"
        )

    if tool_name == "get_segment_breakdown":
        pm = stats["primary_metric"]
        delta = stats["primary_metric_delta"]
        baseline = stats["primary_metric_baseline"]
        segment = scenario["affected_segment"]

        def fmt(d: float) -> str:
            sign = "+" if d >= 0 else ""
            pct = (d / baseline * 100) if baseline != 0 else 0
            return f"{sign}{d:.4f} ({sign}{pct:.1f}%)"

        if segment == "Mobile iOS":
            return (
                f"Mobile iOS:     {pm} delta = {fmt(delta)}  ← PRIMARY IMPACT\n"
                f"Mobile Android: {pm} delta = {fmt(delta * 0.2)}\n"
                f"Desktop:        {pm} delta = {fmt(0.0)}"
            )
        elif segment == "All users":
            return (
                f"Mobile iOS:     {pm} delta = {fmt(delta)}\n"
                f"Mobile Android: {pm} delta = {fmt(delta * 0.95)}\n"
                f"Desktop:        {pm} delta = {fmt(delta * 0.9)}"
            )
        else:  # "None" or anything else
            return (
                f"Mobile iOS:     {pm} delta = {fmt(delta * 0.02)}\n"
                f"Mobile Android: {pm} delta = {fmt(delta * 0.01)}\n"
                f"Desktop:        {pm} delta = {fmt(0.0)}"
            )

    if tool_name == "get_surface_map":
        return (
            f"Primary surface: {scenario['surface']}\n"
            f"Service: {scenario['service']}\n"
            f"Change type: {scenario['change_type']}\n"
            f"Downstream services: none identified"
        )

    if tool_name == "get_similar_incidents":
        service = tool_input.get("service", scenario["service"])
        return (
            f"Incident history for {service} (last 90 days):\n"
            f"- 34 days ago: mobile-viewport layout shift after a UI change "
            f"(checkout dip on iOS, resolved by revert, MTTR 47 min)\n"
            f"- 61 days ago: backend latency regression (no behavioral impact, "
            f"auto-resolved)\n"
            f"Relevance to the current signal is for you to assess based on "
            f"surface, segment, and change type."
        )

    return f"Unknown tool: {tool_name}"


async def run_investigation(scenario: dict, stats: dict) -> dict:
    """Run a ReAct tool-use loop with Claude to produce a structured investigation report."""

    initial_message = (
        f"Investigate this behavioral signal:\n\n"
        f"Change: {scenario['name']} ({scenario['change_type']})\n"
        f"Service: {scenario['service']}\n"
        f"Signal detected: {stats['signal_detected']}\n"
        f"Z-score: {stats['z_score']}\n"
        f"Severity: {stats['severity']}\n"
        f"Primary metric: {stats['primary_metric']}\n"
        f"Delta: {stats['primary_metric_delta']}\n"
        f"Affected segment: {scenario['affected_segment']}\n\n"
        f"Use your tools to investigate then return the JSON diagnosis."
    )

    messages = [{"role": "user", "content": initial_message}]
    max_iterations = 10

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for _ in range(max_iterations):
                headers = {
                    "x-api-key": os.getenv("ANTHROPIC_API_KEY", ""),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                }
                payload = {
                    "model": "claude-sonnet-4-5",
                    "max_tokens": 2048,
                    "system": SYSTEM_PROMPT,
                    "tools": TOOLS,
                    "messages": messages,
                }
                for attempt in range(3):
                    response = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers=headers,
                        json=payload,
                    )
                    if response.status_code != 529:
                        break
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)  # 1s, 2s backoff

                response.raise_for_status()
                body = response.json()

                stop_reason = body.get("stop_reason")

                if stop_reason == "tool_use":
                    # Append assistant turn
                    messages.append({"role": "assistant", "content": body["content"]})

                    # Process every tool_use block in the response
                    tool_results = []
                    for block in body["content"]:
                        if block.get("type") != "tool_use":
                            continue
                        result_text = handle_tool(
                            block["name"], block.get("input", {}), scenario, stats
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": result_text,
                        })

                    messages.append({"role": "user", "content": tool_results})
                    continue  # next iteration

                if stop_reason == "end_turn":
                    # Extract text from the final response
                    text_parts = []
                    for block in body["content"]:
                        if block.get("type") == "text" and block.get("text", "").strip():
                            text_parts.append(block["text"].strip())
                    text = "\n".join(text_parts).strip()

                    if not text:
                        print(f"EMPTY TEXT — full content: {body['content']}")
                        return FALLBACK
                    import re
                    match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
                    if match:
                        return json.loads(match.group(1))
                    match = re.search(r'```\s*(.*?)\s*```', text, re.DOTALL)
                    if match:
                        return json.loads(match.group(1))
                    match = re.search(r'\{.*\}', text, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    print(f'NO JSON FOUND in: {text[:200]}')
                    return FALLBACK

                # Unexpected stop reason
                return FALLBACK

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"AGENT ERROR: {e}")
        return FALLBACK

    # Loop exhausted without end_turn — force a final text-only response
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": os.getenv("ANTHROPIC_API_KEY", ""),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-5",
                    "max_tokens": 2048,
                    "system": SYSTEM_PROMPT,
                    "messages": messages + [{
                        "role": "user",
                        "content": "Tool call limit reached. Using evidence gathered so far, output your final JSON diagnosis now. No more tool calls."
                    }],
                    # No "tools" key — forces text-only response
                },
            )
            response.raise_for_status()
            body = response.json()
            if body.get("stop_reason") == "end_turn":
                text_parts = [b["text"].strip() for b in body["content"] if b.get("type") == "text" and b.get("text","").strip()]
                text = "\n".join(text_parts).strip()
                if text:
                    import re
                    match = re.search(r'\{.*\}', text, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
    except Exception:
        pass
    return FALLBACK
