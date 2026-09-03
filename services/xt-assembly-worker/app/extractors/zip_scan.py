from __future__ import annotations

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

from .common import (
    ChildCandidate,
    Origin,
    ParseResult,
    child_key,
    dirname,
    is_likely_part_name,
    is_xt_assembly_path,
    is_xt_part_file,
    label_from_path,
    norm_path,
)
from .xt_text import parse_part_names_from_xt_bytes


class _HtmlPartParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.names: set[str] = set()
        self._in_link = False
        self._link_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        if tag.lower() == "a" and "href" in attrs_d and ".x_t" in attrs_d["href"].lower():
            self._in_link = True
            self._link_buf = []
        for key in ("title", "data-name", "data-title"):
            if key in attrs_d:
                val = attrs_d[key].strip()
                if is_likely_part_name(val) and not val.lower().endswith(".x_t"):
                    self.names.add(val)

    def handle_data(self, data: str) -> None:
        if self._in_link:
            self._link_buf.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._in_link:
            label = "".join(self._link_buf).strip()
            if is_likely_part_name(label):
                self.names.add(label)
            self._in_link = False
            self._link_buf = []


def _names_from_html(html: str) -> set[str]:
    p = _HtmlPartParser()
    try:
        p.feed(html[:500_000])
    except Exception:
        pass
    link_re = re.compile(r'href\s*=\s*["\']([^"\']+\.x_t)["\'][^>]*>([^<]{1,120})<', re.I)
    for m in link_re.finditer(html):
        label = re.sub(r"\s+", " ", m.group(2)).strip() or label_from_path(m.group(1))
        if is_likely_part_name(label):
            p.names.add(label)
    return p.names


def _local_tag(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1].lower()
    return tag.lower()


def _names_from_xml(xml_bytes: bytes) -> set[str]:
    names: set[str] = set()
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return names

    attr_keys = (
        "name",
        "partname",
        "part_name",
        "componentname",
        "displayname",
        "title",
        "label",
        "description",
    )

    for el in root.iter():
        tag = _local_tag(el.tag)
        if tag in ("part", "component", "partinstance", "item", "occurrence", "product"):
            for k, v in el.attrib.items():
                if _local_tag(k) in attr_keys and v.strip():
                    if is_likely_part_name(v):
                        names.add(v.strip())
        for k, v in el.attrib.items():
            lk = _local_tag(k)
            if lk in attr_keys and v.strip() and is_likely_part_name(v):
                names.add(v.strip())
        if el.text and tag in ("name", "partname", "displayname"):
            t = el.text.strip()
            if is_likely_part_name(t):
                names.add(t)
    return names


def parse_zip_assemblies(zip_bytes: bytes, entry_paths: list[str] | None = None) -> ParseResult:
    result = ParseResult()
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))

    paths = entry_paths or [n for n in zf.namelist() if not n.endswith("/")]
    paths = [norm_path(p) for p in paths if p.strip()]
    assemblies = [p for p in paths if is_xt_assembly_path(p)]
    if not assemblies:
        assemblies = [p for p in paths if p.lower().endswith(".x_t")]

    by_asm: dict[str, dict[str, ChildCandidate]] = {a: {} for a in assemblies}

    def add_child(asm: str, label: str, source: str | None, origin: Origin) -> None:
        if asm not in by_asm:
            by_asm[asm] = {}
        k = child_key(asm, label, source)
        if k not in by_asm[asm]:
            by_asm[asm][k] = ChildCandidate(
                key=k,
                label=label,
                source_path=source,
                assembly_path=norm_path(asm),
                origin=origin,
            )

    # 1) .x_T hermanos en carpeta
    for asm in assemblies:
        asm_dir = dirname(asm)
        for p in paths:
            if not is_xt_part_file(p):
                continue
            if norm_path(p) == norm_path(asm):
                continue
            p_dir = dirname(p)
            if p_dir == asm_dir or (asm_dir and p.startswith(asm_dir + "/")):
                add_child(asm, label_from_path(p), norm_path(p), "zip_xt")
    if any(by_asm[a] for a in assemblies):
        result.methods.append("zip_xt")

    # 2) HTML / XML / BOM en el ZIP
    for name in zf.namelist():
        norm = norm_path(name)
        low = norm.lower()
        if zf.getinfo(name).is_dir():
            continue
        try:
            raw = zf.read(name)
        except Exception:
            continue

        if low.endswith((".html", ".htm")):
            try:
                html = raw.decode("utf-8", errors="ignore")
            except Exception:
                continue
            names = _names_from_html(html)
            if names:
                result.methods.append("html")
            for asm in assemblies:
                for n in names:
                    add_child(asm, n, None, "html")

        elif low.endswith((".xml", ".bom", ".plmxml")) or "bom" in low:
            names = _names_from_xml(raw)
            if names:
                result.methods.append("bom_xml")
            for asm in assemblies:
                for n in names:
                    add_child(asm, n, None, "bom_xml")

        elif low.endswith(".csv") and ("bom" in low or "lista" in low):
            try:
                text = raw.decode("utf-8", errors="ignore")
            except Exception:
                continue
            for line in text.splitlines()[:500]:
                cols = [c.strip() for c in re.split(r"[,;\t]", line) if c.strip()]
                for col in cols:
                    if is_likely_part_name(col):
                        for asm in assemblies:
                            add_child(asm, col, None, "bom_xml")

    # 3) Texto dentro de cada ensamblaje .x_T
    for asm in assemblies:
        try:
            xt = zf.read(asm)
        except KeyError:
            alt = asm.replace("/", "\\")
            try:
                xt = zf.read(alt)
            except KeyError:
                continue
        names = parse_part_names_from_xt_bytes(xt)
        if names:
            result.methods.append("xt_text")
        for n in names:
            add_child(asm, n, None, "xt_text")

    # 4) STEP en carpeta (solo nombres de archivo; geometría requiere OCC/FreeCAD opcional)
    step_parts = [p for p in paths if re.search(r"\.(step|stp)$", p, re.I)]
    if step_parts:
        result.methods.append("step_filename")
        for asm in assemblies:
            asm_dir = dirname(asm)
            for sp in step_parts:
                sp_dir = dirname(sp)
                if sp_dir == asm_dir or (asm_dir and sp.startswith(asm_dir + "/")):
                    add_child(asm, label_from_path(sp), norm_path(sp), "step")

    if not result.methods:
        result.warnings.append(
            "No se encontraron piezas. El .x_T parece binario Parasolid: exporta piezas como .x_T sueltos, "
            "un BOM/XML/HTML en el ZIP, o archivos STEP en la misma carpeta."
        )

    for asm, children in by_asm.items():
        result.assemblies[asm] = sorted(children.values(), key=lambda c: c.label.lower())

    result.methods = sorted(set(result.methods))
    return result
