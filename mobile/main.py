#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WorkBuddy Mobile 独立启动入口。

用法:
  python mobile/main.py --port 8796
  python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795
"""
from __future__ import annotations

import argparse
import os
import sys
import uvicorn

def main():
    parser = argparse.ArgumentParser(description="WorkBuddy Mobile App 独立启动入口")
    parser.add_argument("--host", default=os.getenv("MOBILE_HOST", "0.0.0.0"), help="监听地址")
    parser.add_argument("--port", type=int, default=int(os.getenv("MOBILE_PORT", "8796")), help="服务端口（默认 8796）")
    parser.add_argument("--core-url", default=os.getenv("WB_CORE_URL", "http://127.0.0.1:8795"), help="Core 网关地址")
    args = parser.parse_args()

    os.environ["WB_CORE_URL"] = args.core_url.rstrip("/")
    os.environ["MOBILE_PORT"] = str(args.port)
    os.environ["MOBILE_HOST"] = args.host

    print(f"==================================================")
    print(f"📱 WorkBuddy Mobile App 已启动")
    print(f"   移动端 UI 地址 : http://{args.host}:{args.port}")
    print(f"   连接后端 Core  : {args.core_url}")
    print(f"==================================================")

    uvicorn.run("server.api:app", host=args.host, port=args.port, app_dir=os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    main()
