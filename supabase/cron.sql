-- Run once after deploying the sports-sync Edge Function and creating the two
-- Vault secrets shown in SUPABASE_SETUP.md. Re-running first removes the job.
select cron.unschedule(jobid) from cron.job where jobname = 'gameday-sports-sync';

select cron.schedule(
  'gameday-sports-sync',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_project_url') || '/functions/v1/sports-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'gameday_function_key')
      ),
      body := jsonb_build_object('source', 'supabase-cron')
    );
  $$
);
