"""移动端偏好的 JSON 持久化（原子写）。"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

DEFAULTS = {'realm': 'global'}


class Prefs:
    def __init__(self, path: Path, defaults: dict | None = None):
        self.path = path
        self._lock = threading.Lock()
        self.data = {**DEFAULTS, **(defaults or {})}
        try:
            raw = json.loads(path.read_text(encoding='utf-8'))
            if isinstance(raw, dict):
                self.data.update({k: v for k, v in raw.items() if k in DEFAULTS})
        except (OSError, ValueError):
            pass

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def update(self, patch: dict) -> None:
        with self._lock:
            self.data.update({k: v for k, v in patch.items() if k in DEFAULTS})
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix='.prefs-')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
