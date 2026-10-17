from fastapi import Request

from ..core_client import CoreClient


def core(request: Request) -> CoreClient:
    return request.app.state.core
