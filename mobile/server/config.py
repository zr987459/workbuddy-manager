"""运行配置：命令行 > 环境变量 > 默认值。"""
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # mobile/

BUILTIN_ORIGINS = ('capacitor://localhost', 'https://localhost', 'http://localhost')


@dataclass(frozen=True)
class Settings:
    host: str = '0.0.0.0'
    port: int = 8796
    core_url: str = 'http://127.0.0.1:7864'
    realm: str = 'global'
    secure_cookie: str = 'auto'
    allowed_origins: tuple[str, ...] = field(default_factory=tuple)
    data_dir: Path = HERE / 'data'
    static_dir: Path = HERE / 'web' / 'dist'
    core_timeout: float = 15.0
    log_level: str = 'info'

    @property
    def origins(self) -> list[str]:
        return list(dict.fromkeys([*BUILTIN_ORIGINS, *self.allowed_origins]))


def _norm_realm(v: str) -> str:
    return 'cn' if str(v).strip().lower() == 'cn' else 'global'


def parse_args(argv: list[str] | None = None) -> Settings:
    env = os.environ.get
    p = argparse.ArgumentParser(prog='workbuddy-mobile', description='WorkBuddy 移动端（BFF + PWA）')
    p.add_argument('--host', default=env('MOBILE_HOST', '0.0.0.0'))
    p.add_argument('--port', type=int, default=int(env('MOBILE_PORT', '8796')))
    p.add_argument('--core-url', default=env('MOBILE_CORE_URL', 'http://127.0.0.1:7864'),
                   help='核心 Manager 地址，如 http://127.0.0.1:7864')
    p.add_argument('--realm', default=env('MOBILE_REALM', 'global'), choices=['global', 'cn'])
    p.add_argument('--secure-cookie', default=env('MOBILE_SECURE_COOKIE', 'auto'),
                   choices=['auto', 'true', 'false'])
    p.add_argument('--allowed-origins', default=env('MOBILE_ALLOWED_ORIGINS', ''),
                   help='逗号分隔的额外跨源')
    p.add_argument('--data-dir', default=env('MOBILE_DATA_DIR', str(HERE / 'data')))
    p.add_argument('--static-dir', default=env('MOBILE_STATIC_DIR', str(HERE / 'web' / 'dist')))
    p.add_argument('--core-timeout', type=float, default=float(env('MOBILE_CORE_TIMEOUT', '15')))
    p.add_argument('--log-level', default=env('MOBILE_LOG_LEVEL', 'info'))
    a = p.parse_args(argv)
    core = a.core_url.strip().rstrip('/')
    if not core.startswith(('http://', 'https://')):
        p.error('--core-url 必须以 http:// 或 https:// 开头')
    return Settings(
        host=a.host, port=a.port, core_url=core, realm=_norm_realm(a.realm),
        secure_cookie=a.secure_cookie,
        allowed_origins=tuple(o.strip() for o in a.allowed_origins.split(',') if o.strip()),
        data_dir=Path(a.data_dir), static_dir=Path(a.static_dir),
        core_timeout=a.core_timeout, log_level=a.log_level,
    )
