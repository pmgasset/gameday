-- Run after deploying the sports-sync Edge Function and creating the Vault
-- secrets in SUPABASE_SETUP.md. It removes the legacy five-minute full sync
-- before installing separate low-frequency schedule and live-score jobs.
select cron.unschedule(jobid)
from cron.job
where jobname in ('gameday-sports-sync', 'gameday-schedule-sync', 'gameday-live-score-sync');

-- Persist and reconcile each open week's schedule eight times per day.
select cron.schedule(
  'gameday-schedule-sync',
  '0 */3 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_project_url') || '/functions/v1/sports-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_function_key')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'mode', 'schedule')
    );
  $$
);

-- The function makes provider calls only for games approaching kickoff or in
-- progress, so this frequent job does not repeatedly refresh the whole week.
select cron.schedule(
  'gameday-live-score-sync',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_project_url') || '/functions/v1/sports-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_function_key')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'mode', 'live')
    );
  $$
);
