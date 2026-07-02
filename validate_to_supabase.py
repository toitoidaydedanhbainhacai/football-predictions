"""
Validate finished predictions and write results back to Supabase
================================================================
Companion to save_to_supabase.py. Fills the actual_* / profit_loss_* columns and
flips status PENDING -> SETTLED for matches that have finished, so the frontend's
Accuracy section can compute a live, self-updating track record.

Flow:
  1. Read predictions still PENDING (or missing a result) from Supabase.
  2. For each, fetch the finished match from FootyStats /match by match_id.
  3. If complete: compute actual winner / over-under / goals and 1-unit P/L,
     then PATCH the row (service_role key) and set status = SETTLED.

Env vars (same as the GitHub Actions secrets):
  SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTYSTATSAPI

Usage:
  python validate_to_supabase.py            # writes results to Supabase
  python validate_to_supabase.py --dry-run  # fetch + compute + print, NO writes
"""
import os, sys, time, requests

TABLE = "predictions_soccer_v1_ourmodel"
FS_MATCH = "https://api.football-data-api.com/match"


def _f(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def compute(row, hg, ag):
    """Return the dict of result columns for a finished match."""
    home, away = str(row.get("home_team", "")).strip(), str(row.get("away_team", "")).strip()
    total = hg + ag
    actual_winner = home if hg > ag else (away if ag > hg else "Draw")
    actual_ou = "Over 2.5" if total > 2.5 else "Under 2.5"

    pred_ou = str(row.get("predicted_outcome", "")).strip().lower()
    if pred_ou == actual_ou.lower():
        pl_ou = round(_f(row.get("over_2_5_odds")) - 1, 2) if "over" in actual_ou.lower() \
            else round(_f(row.get("under_2_5_odds")) - 1, 2)
    else:
        pl_ou = -1.0

    pw = str(row.get("predicted_winner", "")).strip()
    if pw == "Home Win" and actual_winner == home:
        pl_ml = round(_f(row.get("home_odds")) - 1, 2)
    elif pw == "Away Win" and actual_winner == away:
        pl_ml = round(_f(row.get("away_odds")) - 1, 2)
    elif pw == "Draw" and actual_winner == "Draw":
        pl_ml = round(_f(row.get("draw_odds")) - 1, 2)
    else:
        pl_ml = -1.0

    return {
        "actual_winner": actual_winner,
        "actual_over_under": actual_ou,
        "actual_home_team_goals": float(hg),
        "actual_away_team_goals": float(ag),
        "actual_total_goals": float(total),
        "status": "SETTLED",
        "profit_loss_outcome": pl_ou,
        "profit_loss_winner": pl_ml,
    }


def main():
    dry = "--dry-run" in sys.argv
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    api = os.getenv("FOOTYSTATSAPI")
    if not (url and key and api):
        print("X Need SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTYSTATSAPI env vars.")
        sys.exit(1)

    hdr = {"apikey": key, "Authorization": f"Bearer {key}"}
    # rows not yet settled (result columns empty)
    r = requests.get(f"{url}/rest/v1/{TABLE}",
                     headers=hdr,
                     params={"select": "*", "actual_winner": "is.null", "order": "date.asc"},
                     timeout=40)
    r.raise_for_status()
    pending = r.json()
    print(f"{len(pending)} prediction(s) awaiting a result{' [DRY RUN]' if dry else ''}\n")

    settled = skipped = 0
    for row in pending:
        mid = row["match_id"]
        try:
            m = requests.get(FS_MATCH, params={"key": api, "match_id": mid}, timeout=30).json()
            d = m.get("data") or {}
            if isinstance(d, list):
                d = d[0] if d else {}
            if not (m.get("success") and d.get("status") == "complete"):
                print(f"  … {row['home_team']} v {row['away_team']} ({mid}) not complete yet")
                skipped += 1
                time.sleep(0.25)
                continue
            hg, ag = int(_f(d.get("homeGoalCount"))), int(_f(d.get("awayGoalCount")))
            upd = compute(row, hg, ag)
            print(f"  {row['home_team']} {hg}-{ag} {row['away_team']}  "
                  f"| ML {row['predicted_winner']}->{upd['actual_winner']} "
                  f"| O/U {row['predicted_outcome']}->{upd['actual_over_under']}")
            if not dry:
                pr = requests.patch(f"{url}/rest/v1/{TABLE}",
                                    headers={**hdr, "Content-Type": "application/json",
                                             "Prefer": "return=minimal"},
                                    params={"match_id": f"eq.{mid}"}, json=upd, timeout=40)
                pr.raise_for_status()
            settled += 1
        except Exception as e:
            print(f"  X {mid}: {str(e)[:100]}")
            skipped += 1
        time.sleep(0.25)

    print(f"\n{'Would settle' if dry else 'Settled'} {settled}, still pending {skipped}.")


if __name__ == "__main__":
    main()
