"""
Save Best Match Predictions to Supabase
========================================
Drop-in replacement for new_save_main.py (which used raw PostgreSQL/psycopg2).
Reads best_match_predictions.csv and UPSERTs into two Supabase tables:
  - predictions_soccer_v1_ourmodel
  - model_training_soccer

Why Supabase: it IS Postgres, but we write through its REST API with the
service_role key (no DB host/port/password juggling) and the frontend reads the
same tables with the public anon key.

Key behaviour vs the old script:
  * Upsert on match_id (insert new, update existing) — same as before.
  * It does NOT overwrite the actual_* / profit_loss_* columns. Those are filled
    by your validation step after matches finish; omitting them from the payload
    means a re-run preserves validated results instead of nulling them.

Env vars required (set as GitHub secrets too):
  SUPABASE_URL          e.g. https://abcdxyz.supabase.co
  SUPABASE_SERVICE_KEY  the service_role key (Project Settings -> API)

Usage:
  python save_to_supabase.py            # writes to Supabase
  python save_to_supabase.py --dry-run  # transform + validate only, no network
"""

import os
import sys
import math
from pathlib import Path

import pandas as pd

CSV_FILE = "best_match_predictions.csv"
TABLE_NAMES = ["predictions_soccer_v1_ourmodel", "model_training_soccer"]

LEAGUE_MAPPING = {
    12325: "England Premier League", 15050: "England Premier League",
    14924: "UEFA Champions League",
    12316: "Spain La Liga", 14956: "Spain La Liga",
    12530: "Italy Serie A", 15068: "Italy Serie A",
    12529: "Germany Bundesliga", 14968: "Germany Bundesliga",
    13973: "USA MLS", 16504: "USA MLS",
    12337: "France Ligue 1", 14932: "France Ligue 1",
    12322: "Netherlands Eredivisie", 14936: "Netherlands Eredivisie",
    12136: "Mexico Liga MX", 15234: "Mexico Liga MX",
    15115: "Portugal Liga NOS",
    13878: "FIFA Club World Cup", 16494: "FIFA World Cup",
}

# Columns we write (prediction data). actual_*/profit_* are intentionally excluded
# so validation results are preserved across re-runs.
PAYLOAD_COLUMNS = [
    "match_id", "date", "league", "league_name", "home_id", "away_id",
    "home_team", "away_team", "home_odds", "away_odds", "draw_odds",
    "over_2_5_odds", "under_2_5_odds", "ctmcl", "predicted_home_goals",
    "predicted_away_goals", "confidence", "grade", "delta",
    "predicted_outcome", "predicted_winner", "status", "data_source",
    "confidence_category",
]


def get_league_name(league_id):
    try:
        return LEAGUE_MAPPING.get(int(league_id), "Unknown League")
    except (TypeError, ValueError):
        return "Unknown League"


def calculate_grade(confidence):
    if pd.isna(confidence):
        return None
    c = max(0.0, min(1.0, float(confidence)))
    score = c * 100
    for cutoff, g in [(90, "A+"), (85, "A"), (80, "A-"), (75, "B+"), (70, "B"),
                      (65, "B-"), (60, "C+"), (55, "C"), (50, "C-")]:
        if score >= cutoff:
            return g
    return "D"


def _clean(v):
    """Make a value JSON-serializable for the Supabase REST API."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if pd.isna(v) if not isinstance(v, (list, dict)) else False:
        return None
    # numpy scalars -> python scalars
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return v


def load_and_transform():
    csv_path = Path(CSV_FILE)
    if not csv_path.exists():
        csv_path = Path(__file__).parent / CSV_FILE
    if not csv_path.exists():
        print(f"X Could not find {CSV_FILE}")
        sys.exit(1)

    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows from {csv_path.name}")

    required = ["match_id", "date", "league_id", "home_team_name", "away_team_name",
               "odds_ft_1", "odds_ft_x", "odds_ft_2", "odds_ft_over25", "odds_ft_under25",
               "CTMCL", "predicted_home_goals", "predicted_away_goals", "confidence",
               "predicted_goal_diff", "ctmcl_prediction", "outcome_label", "status",
               "confidence_category"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        print(f"X Missing required columns: {missing}")
        sys.exit(1)

    out = pd.DataFrame(index=df.index)
    out["match_id"] = df["match_id"]
    out["date"] = df["date"].astype(str)
    out["league"] = df["league_id"].astype(str)
    out["league_name"] = df["league_id"].apply(get_league_name)
    out["home_id"] = df["home_team_id"] if "home_team_id" in df.columns else None
    out["away_id"] = df["away_team_id"] if "away_team_id" in df.columns else None
    out["home_team"] = df["home_team_name"]
    out["away_team"] = df["away_team_name"]
    out["home_odds"] = df["odds_ft_1"]
    out["away_odds"] = df["odds_ft_2"]
    out["draw_odds"] = df["odds_ft_x"]
    out["over_2_5_odds"] = df["odds_ft_over25"]
    out["under_2_5_odds"] = df["odds_ft_under25"]
    out["ctmcl"] = df["CTMCL"]
    out["predicted_home_goals"] = df["predicted_home_goals"]
    out["predicted_away_goals"] = df["predicted_away_goals"]
    out["confidence"] = df["confidence"]
    out["grade"] = df["confidence"].apply(calculate_grade)
    out["delta"] = df["predicted_goal_diff"]
    out["predicted_outcome"] = df["ctmcl_prediction"]
    out["predicted_winner"] = df["outcome_label"]
    out["status"] = df["status"]
    out["data_source"] = "FootyStats_API"
    out["confidence_category"] = df["confidence_category"]

    out = out[PAYLOAD_COLUMNS]
    # De-duplicate by match_id: a single Postgres upsert can't affect the same row
    # twice (error 21000), and the 3-day fixture fetch can repeat a match.
    before = len(out)
    out = out.drop_duplicates(subset="match_id", keep="last")
    if len(out) < before:
        print(f"De-duplicated {before - len(out)} repeated match_id row(s)")
    records = [{k: _clean(v) for k, v in row.items()} for row in out.to_dict("records")]
    return records


def main():
    dry_run = "--dry-run" in sys.argv
    records = load_and_transform()
    print(f"Transformed {len(records)} records ({len(PAYLOAD_COLUMNS)} columns each)")

    if records:
        from collections import Counter
        dist = Counter(r["league_name"] for r in records)
        print("League distribution:", dict(dist))

    if dry_run:
        print("\n[DRY RUN] First record:")
        if records:
            for k, v in records[0].items():
                print(f"  {k}: {v}")
        print("\n[DRY RUN] No data sent. Drop --dry-run (with env vars set) to write to Supabase.")
        return

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("X SUPABASE_URL / SUPABASE_SERVICE_KEY not set. "
              "Add them to your environment or GitHub secrets.")
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("X supabase package not installed. Run: pip install supabase")
        sys.exit(1)

    client = create_client(url, key)
    if not records:
        print("No records to upsert.")
        return

    for table in TABLE_NAMES:
        try:
            # chunk to stay well under request-size limits
            for i in range(0, len(records), 500):
                chunk = records[i:i + 500]
                client.table(table).upsert(chunk, on_conflict="match_id").execute()
            print(f"OK  upserted {len(records)} rows into {table}")
        except Exception as e:
            print(f"X  failed upserting into {table}: {str(e)[:200]}")
            sys.exit(1)

    print("\nDone. Predictions are in Supabase; the frontend can read them with the anon key.")


if __name__ == "__main__":
    main()
