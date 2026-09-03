from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

Origin = Literal["zip_xt", "internal", "bom_xml", "html", "xt_text", "step"]

TECH_TOKENS = re.compile(
    r"^(body|edge|face|vertex|surface|curve|assembly|parasolid|schema|transf|null|true|false|\d+)$",
    re.I,
)


@dataclass
class ChildCandidate:
    key: str
    label: str
    source_path: str | None
    assembly_path: str
    origin: Origin


@dataclass
class ParseResult:
    assemblies: dict[str, list[ChildCandidate]] = field(default_factory=dict)
    methods: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def norm_path(path: str) -> str:
    return path.strip().replace("\\", "/")


def dirname(path: str) -> str:
    parts = norm_path(path).split("/")
    parts.pop()
    return "/".join(parts)


def label_from_path(path: str) -> str:
    base = norm_path(path).split("/")[-1]
    return base[:200]


def is_likely_part_name(name: str) -> bool:
    s = name.strip()
    if len(s) < 2 or len(s) > 120:
        return False
    if TECH_TOKENS.match(s):
        return False
    if re.match(r"^[\d._\-]+$", s):
        return False
    if re.search(r"^(solidworks|parasolid|microsoft)", s, re.I):
        return False
    return bool(re.search(r"[A-Za-zÁ-ú]", s))


def is_xt_assembly_path(path: str) -> bool:
    base = label_from_path(path).lower().removesuffix(".x_t").strip()
    if re.match(r"^ensamblaje\d*$", base, re.I):
        return True
    return base in ("assembly", "ensamblaje")


def is_xt_part_file(path: str) -> bool:
    p = norm_path(path)
    if not p.lower().endswith(".x_t"):
        return False
    return not is_xt_assembly_path(p)


def child_key(assembly_path: str, label: str, source_path: str | None) -> str:
    return source_path or f"{norm_path(assembly_path)}::{label}"


def synthetic_source_path(assembly_path: str, label: str) -> str:
    from urllib.parse import quote

    return f"{norm_path(assembly_path)}::{quote(label.strip())}"
