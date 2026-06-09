import os
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

GHE_BASE = os.getenv("GHE_BASE_URL", "https://api.github.com")

TOKEN = os.getenv("GITHUB_TOKEN") or os.getenv("GHE_TOKEN", "")
ORG   = "shashank9mittal"   # swap to Walmart org on Walmart laptop
REPO  = "wake-cios"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _infer_change_type(files: list[str]) -> str:
    for f in files:
        if "prompts/" in f:
            return "prompt"
        if "config.json" in f:
            return "config"
    return "code"


def _infer_surface(files: list[str], change_type: str) -> str:
    if change_type == "prompt":
        return "ai-recommendations"
    for f in files:
        if "checkout" in f:
            return "mobile-checkout"
        if "frontend" in f or ".tsx" in f or ".ts" in f:
            return "web-frontend"
    return "backend-api"


async def fetch_latest_merged_pr() -> dict | None:
    """Fetch the most recently merged PR and return as a ChangeEvent dict."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get latest closed PR
        r = await client.get(
            f"{GHE_BASE}/repos/{ORG}/{REPO}/pulls",
            headers=_headers(),
            params={"state": "closed", "sort": "updated",
                    "direction": "desc", "per_page": 1},
        )
        r.raise_for_status()
        prs = r.json()

        if not prs:
            return None

        pr = prs[0]

        # Only use merged PRs (not just closed)
        if not pr.get("merged_at"):
            return None

        pr_number = pr["number"]

        # Get changed files
        files_r = await client.get(
            f"{GHE_BASE}/repos/{ORG}/{REPO}/pulls/{pr_number}/files",
            headers=_headers(),
        )
        files_r.raise_for_status()
        changed_files = [f["filename"] for f in files_r.json()]

        change_type = _infer_change_type(changed_files)
        surface     = _infer_surface(changed_files, change_type)

        return {
            "id":              f"ghe-pr-{pr_number}",
            "pr_number":       pr_number,
            "name":            pr["title"],
            "service":         REPO,
            "engineer":        pr["user"]["login"],
            "team":            "Wake Engineering",
            "surface":         surface,
            "change_type":     change_type,
            "change_artifact": pr.get("body") or f"PR #{pr_number} merged into main",
            "primary_metric":  "checkout_initiation_rate",
            "deployed_at":     pr["merged_at"],
            "affected_segment": "Mobile iOS",
            "status":          "idle",
            "severity":        "none",
            "merged_at":       pr["merged_at"],
            "html_url":        pr["html_url"],
            "changed_files":   changed_files,
        }
