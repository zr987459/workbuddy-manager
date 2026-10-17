"""BFF 运行配置：命令行参数 > 环境变量 > 默认值。

只读一次、全进程共享。这里**不放任何凭据**：BFF 走会话透传，自己不持有
core 的账号、密码或 API Token（理由见 mobile/README.md「鉴权」一节）。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

MOBILE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = MOBILE_DIR / 'web' / 'dist'


def _env(name: str, default: str = '') -> str:
    return os.environ.get(name, default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in ('1', 'true', 'yes', 'on')


@dataclass
class Settings:
    host: str = '127.0.0.1'
    port: int = 7870
    # 被代理的 WorkBuddy core（server/main.py，默认 7864）
    core_url: str = 'http://127.0.0.1:7864'
    # 移动端挂载前缀：页面在 /m/，接口在 /m/api/
    base_path: str = '/m'
    # 访问 BFF 的 Cookie 是否强制 Secure：auto = 按 X-Forwarded-Proto / scheme 判断
    secure_cookie: str = 'auto'
    # 仅当 BFF 前面有自己的反代时才打开：采信 X-Real-IP 作为真实客户端 IP
    trust_proxy: bool = False
    # 调 core 的超时（秒）。流式对话单独不设读超时。
    core_timeout: float = 20.0
    # 额外允许的 Origin（逗号分隔）。默认只认同源，Capacitor 壳会用到 capacitor://localhost
    extra_origins: list[str] = field(default_factory=list)
    # 展示给用户复制的网关地址（core 的 /v1 对外地址），例如 https://wb.example.com/v1
    public_gateway: str = ''
    dist_dir: Path = DIST_DIR

    @property
    def api_prefix(self) -> str:
        return f'{self.base_path}/api'

    @property
    def cookie_name(self) -> str:
        return 'wbm_session'


def load(**overrides) -> Settings:
    s = Settings(
        host=_env('WBM_HOST', '127.0.0.1'),
        port=int(_env('WBM_PORT', '7870') or 7870),
        core_url=_env('WBM_CORE_URL', 'http://127.0.0.1:7864'),
        base_path='/' + _env('WBM_BASE_PATH', 'm').strip('/'),
        secure_cookie=_env('WBM_SECURE_COOKIE', 'auto').lower(),
        trust_proxy=_env_bool('WBM_TRUST_PROXY', False),
        core_timeout=float(_env('WBM_CORE_TIMEOUT', '20') or 20),
        public_gateway=_env('WBM_PUBLIC_GATEWAY').rstrip('/'),
        extra_origins=[o.strip() for o in _env('WBM_EXTRA_ORIGINS').split(',') if o.strip()],
    )
    for k, v in overrides.items():
        if v is not None:
            setattr(s, k, v)
    s.core_url = s.core_url.rstrip('/')
    if s.base_path in ('', '/'):
        raise ValueError('WBM_BASE_PATH 不能为空：移动端必须挂在独立前缀下（默认 /m）')
    return s
