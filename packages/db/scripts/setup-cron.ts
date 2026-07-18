import pg from 'pg';

/**
 * Install a Supabase pg_cron schedule that pings the serverless worker endpoint
 * every minute — a free, self-contained trigger that needs no Vercel Pro plan
 * and no separate worker host. Uses pg_net for the outbound HTTPS call.
 *
 * Reads DATABASE_URL, CRON_SECRET, and CRON_TARGET_URL from the environment so
 * the secret is never committed. Safe to re-run (re-schedules idempotently).
 *
 * Usage:
 *   DATABASE_URL=... CRON_SECRET=... \
 *   CRON_TARGET_URL=https://your-app.vercel.app/api/cron/worker \
 *   npm run cron:setup --workspace @leadfinder/db
 */
const JOB_NAME = 'leadfinder-worker';
const PARALLEL = 2; // concurrent ticks per minute (SKIP LOCKED keeps them safe)

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.CRON_SECRET;
  const target =
    process.env.CRON_TARGET_URL ??
    'https://intelligent-lead-finder.vercel.app/api/cron/worker';
  if (!databaseUrl || !secret) {
    console.error('DATABASE_URL and CRON_SECRET are required.');
    process.exit(1);
  }

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query('create extension if not exists pg_cron;');
    await db.query('create extension if not exists pg_net;');

    // Remove any prior schedule (ignore if absent).
    await db.query(
      `do $$ begin
         if exists (select 1 from cron.job where jobname = '${JOB_NAME}') then
           perform cron.unschedule('${JOB_NAME}');
         end if;
       end $$;`,
    );

    const headers = JSON.stringify({ Authorization: `Bearer ${secret}` });
    // Fire PARALLEL concurrent pings each minute; each returns quickly and the
    // Vercel function drains a bounded batch. Big runs finish across ticks.
    const command = `select net.http_get(
        url := '${target}',
        headers := '${headers}'::jsonb,
        timeout_milliseconds := 9000
      ) from generate_series(1, ${PARALLEL});`;
    await db.query(`select cron.schedule('${JOB_NAME}', '* * * * *', $cmd$${command}$cmd$);`);

    const check = await db.query(
      `select jobname, schedule, active from cron.job where jobname = '${JOB_NAME}'`,
    );
    console.log('pg_cron schedule installed:', JSON.stringify(check.rows[0]));
    console.log(`  → pings ${target} ${PARALLEL}× every minute.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
