"""移动端会话：浏览器只拿到不透明的 `wbm_sid`，core 的会话 cookie 留在服务端内存。

为什么不把 core cookie 直接透给浏览器：core 的 cookie 是 SameSite=Lax、Path=/，
挂到移动端域名上既不受 BFF 控制也无法吊销；放在服务端可以随登出立即作废。
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from threading import Lock

from .core import CoreAuth

COOKIE = 'wbm_sid'


@dataclass
class Session:
    auth: CoreAuth
    username: str
    role: str
    expires_at: float
    created_at: float = field(default_factory=time.time)


class SessionStore:
    def __init__(self, ttl: int, max_sessions: int = 256):
        self.ttl = ttl
        self.max_sessions = max_sessions
        self._items: dict[str, Session] = {}
        self._lock = Lock()

    def create(self, core_cookie: str, username: str, role: str) -> str:
        sid = secrets.token_urlsafe(32)
        with self._lock:
            self._prune()
            if len(self._items) >= self.max_sessions:  # 最老的先出
                oldest = min(self._items, key=lambda k: self._items[k].created_at)
                self._items.pop(oldest, None)
            self._items[sid] = Session(CoreAuth(cookie=core_cookie), username, role,
                                       time.time() + self.ttl)
        return sid

    def get(self, sid: str | None) -> Session | None:
        if not sid:
            return None
        with self._lock:
            s = self._items.get(sid)
            if s is None:
                return None
            if s.expires_at < time.time():
                self._items.pop(sid, None)
                return None
            return s

    def drop(self, sid: str | None) -> None:
        if sid:
            with self._lock:
                self._items.pop(sid, None)

    def _prune(self) -> None:
        now = time.time()
        for k in [k for k, s in self._items.items() if s.expires_at < now]:
            self._items.pop(k, None)
