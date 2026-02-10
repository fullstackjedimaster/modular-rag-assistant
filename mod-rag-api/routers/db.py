from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

import asyncpg
from fastapi import HTTPException, Request
from fastapi.applications import FastAPI


AppLike = Union[FastAPI, Any]  # anything with .state is fine


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL env var is required for db access.")
    return url


def _get_app(obj: Any) -> Any:
    """
    Accept either:
      - FastAPI app
      - Request
    and return the FastAPI app-ish object that has .state.
    """
    if hasattr(obj, "app"):  # Request
        return obj.app
    return obj  # FastAPI


async def init_db_pool(app_or_request: AppLike) -> None:
    """
    Initialize asyncpg pool once and store on app.state.db_pool.
    Call from main.py startup:
        await init_db_pool(app)
    """
    app = _get_app(app_or_request)

    if getattr(app.state, "db_pool", None) is not None:
        return

    try:
        app.state.db_pool = await asyncpg.create_pool(
            dsn=_database_url(),
            min_size=int(os.getenv("DB_POOL_MIN", "1")),
            max_size=int(os.getenv("DB_POOL_MAX", "10")),
            command_timeout=float(os.getenv("DB_COMMAND_TIMEOUT", "30")),
        )
    except Exception as e:
        raise RuntimeError(f"Failed to create asyncpg pool: {e}") from e


async def close_db_pool(app_or_request: AppLike) -> None:
    """
    Close pool if present. Call from main.py shutdown:
        await close_db_pool(app)
    """
    app = _get_app(app_or_request)
    pool: Optional[asyncpg.Pool] = getattr(app.state, "db_pool", None)
    if pool is None:
        return
    await pool.close()
    app.state.db_pool = None


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="DB pool not initialized (app.state.db_pool is missing).")
    return pool


async def call_rows(request: Request, fn: str, *args: Any) -> List[Dict[str, Any]]:
    """
    Call a SQL function that returns SETOF records / TABLE.
    """
    pool = _pool_from_request(request)
    sql = f"SELECT * FROM {fn}({', '.join(f'${i}' for i in range(1, len(args) + 1))});"
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *args)
            return [dict(r) for r in rows]
    except asyncpg.PostgresError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


async def call_val(request: Request, fn: str, *args: Any) -> Any:
    """
    Call a SQL function that returns a single scalar.
    """
    pool = _pool_from_request(request)
    sql = f"SELECT {fn}({', '.join(f'${i}' for i in range(1, len(args) + 1))}) AS v;"
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql, *args)
            return None if row is None else row["v"]
    except asyncpg.PostgresError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


async def call_jsonb(request: Request, fn: str, *args: Any) -> Any:
    """
    Call a SQL function that returns JSON/JSONB.
    asyncpg typically returns JSON as dict/list already.
    """
    v = await call_val(request, fn, *args)
    return v
