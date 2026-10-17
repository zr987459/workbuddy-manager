#!/usr/bin/env python3
"""WorkBuddy Mobile 独立入口。

    python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795

core-url 指向桌面版 Manager（server/，默认端口 7864）。移动端不读写 core 的数据库与账号目录，
所有能力都经 core 的 HTTP 接口完成，所以两者可以部署在不同机器上。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# 直接运行脚本时 sys.path[0] 是 mobile/，`import server` 会有歧义（仓库根也有 server/）。
# 统一按包导入 mobile.server，且绝不把 core 的 server/ 当作依赖。
sys.path[:] = [p for p in sys.path if Path(p or '.').resolve() != HERE]
sys.path.insert(0, str(ROOT))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog='workbuddy-mobile', description='WorkBuddy Mobile BFF + PWA')
    ap.add_argument('--host', default=None, help='监听地址（默认 127.0.0.1；局域网访问用 0.0.0.0）')
    ap.add_argument('--port', type=int, default=None, help='监听端口（默认 8796）')
    ap.add_argument('--core-url', default=None, help='core（桌面版 Manager）地址，如 http://127.0.0.1:7864')
    ap.add_argument('--gateway-url', default=None,
                    help='下游客户端访问 /v1 的公开地址（复制 curl 用），默认同 core-url')
    ap.add_argument('--allowed-origin', action='append', default=None,
                    help='额外允许的跨源来源，可重复（APK 壳用 capacitor://localhost）')
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    from mobile.server.settings import Settings

    settings = Settings.from_env(
        host=args.host, port=args.port, core_url=args.core_url, gateway_url=args.gateway_url,
        allowed_origins=tuple(args.allowed_origin) if args.allowed_origin else None,
    )
    import uvicorn

    from mobile.server.app import create_app

    print(f'WorkBuddy Mobile → http://{settings.host}:{settings.port}  (core: {settings.core_base})')
    if settings.host not in ('127.0.0.1', 'localhost', '::1'):
        print('⚠ 正在非本机地址监听：请放在 HTTPS 反代或 Tailscale / Cloudflare Tunnel 之后使用。')
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port,
                proxy_headers=True, forwarded_allow_ips='127.0.0.1', log_level='info')


if __name__ == '__main__':
    main()
