import os
import json
import httpx
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")

async def generate_summary_bullets(
    scenario: dict,
    stats: dict,
    investigation: dict
) -> list[str]:
    """Generate 3 plain-English summary bullets for VP audience."""

    pm = stats['primary_metric']
    delta_pct = stats['all_metrics'][pm]['delta_pct']

    prompt = f"""You are summarizing a deployment investigation for a VP audience.

Change: {scenario['name']} ({scenario['change_type']})
Service: {scenario['service']}

Key findings:
- Signal detected: {investigation['signal_detected']}
- Affected: {investigation['affected_segment']}
- Primary metric delta: {delta_pct:.1f}%
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
