from __future__ import annotations

import re

from .common import is_likely_part_name


def parse_part_names_from_xt_bytes(data: bytes) -> list[str]:
    sample = data[: min(len(data), 2_000_000)]
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        text = sample.decode("latin-1", errors="ignore")

    printable = sum(1 for c in text[:8000] if c in "\t\n\r" or 32 <= ord(c) < 127)
    if printable / max(min(len(text), 8000), 1) < 0.55:
        return []

    names: set[str] = set()
    patterns = [
        re.compile(r"'([A-Za-zÁ-ú][A-Za-z0-9_\- áéíóúÁÉÍÓÚñÑ.,()]{1,100})'"),
        re.compile(r'"([A-Za-zÁ-ú][A-Za-z0-9_\- áéíóúÁÉÍÓÚñÑ.,()]{1,100})"'),
        re.compile(r"(?:NAME|name|LABEL)\s*=\s*'([^']{2,100})'", re.I),
    ]
    for pat in patterns:
        for m in pat.finditer(text):
            label = m.group(1).strip()
            if is_likely_part_name(label):
                names.add(label)
    return sorted(names)[:200]
