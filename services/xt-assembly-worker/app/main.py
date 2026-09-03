"""
Worker HTTP: descarga ZIP de diseño y extrae piezas por ensamblaje .x_T.

Uso local:
  cd services/xt-assembly-worker
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8090

POST /v1/parse-zip
  { "zipUrl": "https://...", "entryPaths": ["SOLID/Ensamblaje1.x_t", ...] }
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.extractors.zip_scan import parse_zip_assemblies

app = FastAPI(title="SOLAINO XT Assembly Worker", version="1.0.0")

WORKER_SECRET = os.environ.get("XT_WORKER_SECRET", "").strip()


class ParseZipRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zip_url: str = Field(..., alias="zipUrl")
    entry_paths: list[str] | None = Field(None, alias="entryPaths")


def _child_to_json(c: Any) -> dict[str, Any]:
    return {
        "key": c.key,
        "label": c.label,
        "sourcePath": c.source_path,
        "assemblyPath": c.assembly_path,
        "origin": c.origin,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/parse-zip")
async def parse_zip(
    body: ParseZipRequest,
    authorization: str | None = Header(None),
    x_worker_secret: str | None = Header(None, alias="X-Worker-Secret"),
) -> dict[str, Any]:
    if WORKER_SECRET:
        token = (x_worker_secret or authorization or "").removeprefix("Bearer ").strip()
        if token != WORKER_SECRET:
            raise HTTPException(status_code=401, detail="Invalid worker secret")

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        res = await client.get(body.zip_url)
        if res.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo descargar el ZIP ({res.status_code})",
            )
        zip_bytes = res.content

    parsed = parse_zip_assemblies(zip_bytes, body.entry_paths)
    assemblies_json = {
        asm: [_child_to_json(c) for c in children]
        for asm, children in parsed.assemblies.items()
    }

    total_children = sum(len(v) for v in assemblies_json.values())
    status = "ok" if total_children > 0 else "partial"

    return {
        "status": status,
        "assemblies": assemblies_json,
        "methods": parsed.methods,
        "warnings": parsed.warnings,
        "assemblyCount": len(assemblies_json),
        "childCount": total_children,
    }
