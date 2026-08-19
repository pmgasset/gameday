-- BALLDONTLIE calls the Hall of Fame Game preseason Week 1. GameDay treats
-- the three full preseason weekends as Weeks 1–3, so shift imported provider
-- games down one week. Pool lines and picks stay attached to the same game IDs.

update public.games
set nfl_week = nfl_week - 1,
    updated_at = now()
where provider = 'balldontlie'
  and season_type = 'preseason'
  and nfl_week between 1 and 4;
