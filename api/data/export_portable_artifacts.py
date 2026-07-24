"""
One-time conversion: re-export the two pickle artifacts that are NOT
portable across numpy/pandas major versions (skill_emb_lookup.pkl uses raw
numpy ndarrays; courses.pkl is a pandas DataFrame pickled with a pandas/numpy
build that a different install won't necessarily be able to unpickle) into
plain JSON, which is fully version-agnostic.

Run this with whichever Python environment currently CAN load the existing
.pkl files (i.e. the one the notebooks ran in), not the API's venv:

    python export_portable_artifacts.py

Reads/writes relative to this script's directory (data/processed/).
"""

import json
import math
import pickle
from pathlib import Path

import pandas as pd

PROCESSED = Path(__file__).parent / "processed"


def _clean(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):  # numpy scalar -> native python
        return v.item()
    return v


def export_skill_emb_lookup():
    with open(PROCESSED / "skill_emb_lookup.pkl", "rb") as f:
        skill_emb_lookup = pickle.load(f)

    portable = {name: [float(x) for x in vec] for name, vec in skill_emb_lookup.items()}

    with open(PROCESSED / "skill_emb_lookup.json", "w") as f:
        json.dump(portable, f)

    print(f"skill_emb_lookup.json written ({len(portable)} skills)")


def export_courses():
    df = pd.read_pickle(PROCESSED / "courses.pkl")
    records = []
    for _, row in df.iterrows():
        record = {col: _clean(row[col]) for col in df.columns}
        records.append(record)

    with open(PROCESSED / "courses.json", "w") as f:
        json.dump(records, f)

    print(f"courses.json written ({len(records)} courses)")


if __name__ == "__main__":
    export_skill_emb_lookup()
    export_courses()
