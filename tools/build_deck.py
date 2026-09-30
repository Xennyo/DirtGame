#!/usr/bin/env python3
"""Génère deck.js à partir de content/gages.md.

Usage : python3 tools/build_deck.py
Relancer après chaque modification de content/gages.md.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "gages.md"
OUT = ROOT / "deck.js"

LEVELS = {"soft": "soft", "chaud": "chaud", "hot": "hot"}
ITEM = re.compile(r"^\d+\.\s+(.*)$")
TAG = re.compile(r"\[(Tous|H|F)\]\s*")


def duration(text):
    m = re.search(r"(\d+)\s*secondes?", text)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*minutes?", text)
    if m:
        return int(m.group(1)) * 60
    return 0


def clean(text):
    text = text.replace("✍️", "")
    text = re.sub(r"_\((nouveau)\)_", "", text)
    return text.strip()


def parse():
    deck = {lv: {"A": [], "V": []} for lv in LEVELS.values()}
    level = kind = None
    for line in SRC.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("## "):
            level = next((v for k, v in LEVELS.items() if k in line.lower()), None)
            kind = None
        elif line.startswith("### "):
            kind = "A" if "action" in line.lower() else "V" if "vérit" in line.lower() else None
        elif level and kind:
            m = ITEM.match(line)
            if not m:
                continue
            body = clean(m.group(1))
            # "[H] texte / [F] texte" : une variante par genre
            parts = TAG.split(body)
            if len(parts) == 1:
                entries = [("Tous", body)]
            else:
                entries = [(parts[i], parts[i + 1].strip().rstrip("/").strip()) for i in range(1, len(parts) - 1, 2)]
            for g, t in entries:
                deck[level][kind].append({"t": t, "g": g, "d": duration(t)})
    return deck


if __name__ == "__main__":
    deck = parse()
    js = "// GÉNÉRÉ par tools/build_deck.py depuis content/gages.md : ne pas modifier à la main.\n"
    js += "window.DECK = " + json.dumps(deck, ensure_ascii=False, indent=1) + ";\n"
    OUT.write_text(js, encoding="utf-8")
    for lv, d in deck.items():
        print(lv, "actions:", len(d["A"]), "vérités:", len(d["V"]))
