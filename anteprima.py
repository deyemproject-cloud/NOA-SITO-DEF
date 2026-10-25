#!/usr/bin/env python3
"""Genera un'anteprima PRIVATA del sito sotto un percorso con codice segreto (noindex, senza analytics).
Uso: python3 anteprima.py  → scrive in ../anteprima/<codice>/ e stampa il percorso."""
import re, shutil, secrets, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
OUT_BASE = ROOT.parent / "anteprima"
cod_file = OUT_BASE / ".codice"
OUT_BASE.mkdir(exist_ok=True)
cod = cod_file.read_text().strip() if cod_file.exists() else secrets.token_hex(5)
cod_file.write_text(cod)
PFX = f"/noa-anteprima-{cod}"
dst = OUT_BASE / cod
if dst.exists(): shutil.rmtree(dst)
shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns(".git", "src", "partials", "build.mjs", "anteprima.py", ".lastmod.json", "loghi", "*.md"))
for f in dst.rglob("*.html"):
    h = f.read_text(encoding="utf8")
    h = re.sub(r'(href|src|action)="/(?!/)', rf'\1="{PFX}/', h)
    h = h.replace("https://wa.me", "https://wa.me")
    h = re.sub(r'<script defer src="https://cloud\.umami\.is[^>]*></script>', "", h)
    h = re.sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="noindex, nofollow">', h)
    f.write_text(h, encoding="utf8")
for f in list(dst.glob("*.txt")) + list(dst.glob("sitemap.xml")): f.unlink()
(dst / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
print(PFX)
