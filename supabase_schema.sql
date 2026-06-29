-- ============================================================
-- Supabase schema for football predictions
-- Run this ONCE in your Supabase project: SQL Editor -> paste -> Run.
-- Creates the two prediction tables (same 31 columns as the old Postgres
-- setup) plus a public read policy so the frontend can query with the anon key.
-- Writes happen with the service_role key (bypasses RLS).
-- ============================================================

create table if not exists predictions_soccer_v1_ourmodel (
    match_id                bigint primary key,
    date                    text,
    league                  text,
    league_name             text,
    home_id                 bigint,
    away_id                 bigint,
    home_team               text,
    away_team               text,
    home_odds               numeric,
    away_odds               numeric,
    draw_odds               numeric,
    over_2_5_odds           numeric,
    under_2_5_odds          numeric,
    ctmcl                   numeric,
    predicted_home_goals    numeric,
    predicted_away_goals    numeric,
    confidence              numeric,
    grade                   text,
    delta                   numeric,
    predicted_outcome       text,
    predicted_winner        text,
    status                  text,
    data_source             text,
    confidence_category     text,
    actual_over_under       text,
    actual_winner           text,
    profit_loss_outcome     numeric,
    profit_loss_winner      numeric,
    actual_home_team_goals  numeric,
    actual_away_team_goals  numeric,
    actual_total_goals      numeric,
    updated_at              timestamptz default now()
);

-- Second table is identical (mirrors the original dual-table setup).
create table if not exists model_training_soccer (like predictions_soccer_v1_ourmodel including all);

-- Helpful indexes for the frontend (filter by league / sort by date).
create index if not exists idx_pred_league on predictions_soccer_v1_ourmodel (league_name);
create index if not exists idx_pred_date   on predictions_soccer_v1_ourmodel (date);

-- ---------- Row Level Security ----------
alter table predictions_soccer_v1_ourmodel enable row level security;
alter table model_training_soccer        enable row level security;

-- Public READ (anon key) so the static frontend can fetch predictions.
drop policy if exists "public read predictions" on predictions_soccer_v1_ourmodel;
create policy "public read predictions" on predictions_soccer_v1_ourmodel
    for select using (true);

drop policy if exists "public read training" on model_training_soccer;
create policy "public read training" on model_training_soccer
    for select using (true);

-- NOTE: do NOT add an anon insert/update policy. The pipeline writes with the
-- service_role key, which bypasses RLS, so writes stay private while reads are public.
