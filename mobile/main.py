#!/usr/bin/env python3
"""WorkBuddy Mobile 独立入口。

    python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795

前端产物在 mobile/web/dist（仓库内已附带一份构建结果，改了前端后执行
`cd mobile/web && npm ci && npm run build` 重新生成）。
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# 以脚本方式运行时 sys.path[0] 是 mobile/：里面的 server/ 会和仓库根目录的
# core 包 `server` 同名。换成仓库根目录，统一按 `mobile.server` 导入，
# 杜绝「误把 core 当成 BFF（或反过来）」导入的可能。
if sys.path and Path(sys.path[0]).resolve() == HERE:
    sys.path.pop(0)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog='workbuddy-mobile', description='WorkBuddy 移动端 BFF')
    p.add_argument('--host', default=None, help='监听地址（默认 127.0.0.1，环境变量 WBM_HOST）')
    p.add_argument('--port', type=int, default=None, help='监听端口（默认 7870，环境变量 WBM_PORT）')
    p.add_argument('--core-url', default=None,
                   help='WorkBuddy core 地址（默认 http://127.0.0.1:7864，环境变量 WBM_CORE_URL）')
    p.add_argument('--base-path', default=None, help='挂载前缀（默认 /m，环境变量 WBM_BASE_PATH）')
    p.add_argument('--reload', action='store_true', help='开发模式：代码变更自动重载')
    return p.parse_args(argv)


def _load_dotenv(path: Path) -> None:
    """极简 .env 读取：只填充尚未设置的变量，不引入额外依赖。"""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> None:
    _load_dotenv(HERE / '.env')
    args = parse_args(argv)
    # 命令行写回环境变量：--reload 时子进程按环境变量重建配置
    for flag, env in (('host', 'WBM_HOST'), ('port', 'WBM_PORT'),
                      ('core_url', 'WBM_CORE_URL'), ('base_path', 'WBM_BASE_PATH')):
        val = getattr(args, flag)
        if val is not None:
            os.environ[env] = str(val)

    import uvicorn
    from mobile.server.settings import load

    s = load()
    if s.host not in ('127.0.0.1', 'localhost', '::1'):
        print(f'[mobile] 注意：监听 {s.host}，请确保前面有 HTTPS 反代与访问控制。', flush=True)
    print(f'[mobile] http://{s.host}:{s.port}{s.base_path}/  →  core {s.core_url}', flush=True)
    uvicorn.run('mobile.server.app:create_app', factory=True, host=s.host, port=s.port,
                reload=args.reload, reload_dirs=[str(HERE / 'server')] if args.reload else None,
                proxy_headers=False, log_level='info')


if __name__ == '__main__':
    main()
