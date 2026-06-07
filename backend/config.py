import json
from pathlib import Path

CONFIG = json.loads(
    (Path(__file__).parent / "data" / "wake.config.json").read_text()
)
