"""运行配置：命令行参数 > 环境变量 > 默认值。"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

WEB_DIST = Path(__file__).resolve().parent.parent / 'web' / 'dist'


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else default


@dataclass(frozen=True)
class Settings:
    core_url: str = 'http://127.0.0.1:7864'
    host: str = '127.0.0.1'
    port: int = 8796
    # 额外允许的跨源来源（APK 壳 / 本地开发）。同源 PWA 不需要配置。
    allowed_origins: tuple[str, ...] = ()
    # 下游客户端调用 /v1 的公开地址（复制 curl / base_url 时用）。留空 = core_url
    gateway_url: str = ''
    # 移动端会话有效期（秒）。只在内存里，进程重启需要重新登录。
    session_ttl: int = 7 * 86400
    # 调 core 的超时（秒）。流式对话单独使用更长的读超时。
    core_timeout: float = 15.0
    stream_timeout: float = 600.0
    # 仪表盘 SSE 推送间隔（秒）
    live_interval: float = 5.0
    web_dist: Path = field(default=WEB_DIST)

    @property
    def core_base(self) -> str:
        return self.core_url.rstrip('/')

    @property
    def public_gateway(self) -> str:
        return (self.gateway_url or self.core_url).rstrip('/')

    @classmethod
    def from_env(cls, **overrides) -> 'Settings':
        origins = tuple(o.strip() for o in _env('MOBILE_ALLOWED_ORIGINS', '').split(',') if o.strip())
        base = dict(
            core_url=_env('MOBILE_CORE_URL', cls.core_url),
            host=_env('MOBILE_HOST', cls.host),
            port=int(_env('MOBILE_PORT', str(cls.port))),
            allowed_origins=origins,
            gateway_url=_env('MOBILE_GATEWAY_URL', ''),
        )
        base.update({k: v for k, v in overrides.items() if v is not None})
        if not str(base['core_url']).startswith(('http://', 'https://')):
            raise ValueError('core_url 必须以 http:// 或 https:// 开头')
        return cls(**base)
