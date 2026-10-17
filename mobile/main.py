#!/usr/bin/env python3
"""WorkBuddy Mobile —— 独立运行的移动端 BFF + PWA。

    python mobile/main.py --port 8796 --core-url http://127.0.0.1:7864

本进程**不 import 仓库根目录的 `server` 包**：所有数据都经 HTTP 从核心
Manager（--core-url）取，因此可以部署在另一台机器、另一个容器里。
网关数据面（/v1/*）仍由核心提供，移动端只做管理面。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 保证 `import server` 解析到 mobile/server，而不是仓库根的核心 server 包
sys.path.insert(0, str(HERE))
for k in [m for m in sys.modules if m == 'server' or m.startswith('server.')]:
    del sys.modules[k]


def main(argv: list[str] | None = None) -> int:
    from server.config import Settings, parse_args

    settings: Settings = parse_args(argv)
    import uvicorn

    from server.app import create_app

    app = create_app(settings)
    print(f'[workbuddy-mobile] http://{settings.host}:{settings.port}  '
          f'core={settings.core_url}  realm={settings.realm}', flush=True)
    uvicorn.run(app, host=settings.host, port=settings.port,
                proxy_headers=True, forwarded_allow_ips=os.environ.get('MOBILE_FORWARDED_ALLOW_IPS', '127.0.0.1'),
                log_level=settings.log_level)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
