"""
One-command runner for the World Cup prediction pipeline.

Loads .env, forces UTF-8 (so the emoji prints don't crash on Windows), then runs:
  today_matches.py  ->  fetch_data.py  ->  predicting.py  ->  save_to_supabase.py

Usage:  python run_pipeline.py
"""
import os
import sys
import subprocess
from pathlib import Path

HERE = Path(__file__).parent


def load_env():
    env_path = HERE / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    if not os.environ.get("FOOTYSTATSAPI"):
        print("! FOOTYSTATSAPI not set (add it to .env). Stage 1 will fail.")


def main():
    load_env()
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    stages = [
        ("Stage 1/4  fetch fixtures", "today_matches.py"),
        ("Stage 2/4  build features", "fetch_data.py"),
        ("Stage 3/4  predict (Ridge)", "predicting.py"),
        ("Stage 4/4  store in Supabase", "save_to_supabase.py"),
    ]
    for label, script in stages:
        print(f"\n{'='*60}\n{label}  ->  {script}\n{'='*60}")
        result = subprocess.run([sys.executable, str(HERE / script)], env=env)
        if result.returncode != 0:
            print(f"\nX  {script} failed (exit {result.returncode}). Stopping.")
            sys.exit(result.returncode)

    print("\nAll stages complete. Predictions are in Supabase; "
          "open frontend/index.html to view them.")


if __name__ == "__main__":
    main()
