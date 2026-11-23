/**
 * PromptPerfect database verification suite.
 *
 * pgTAP-style assertions implemented in plain Node.js + `pg` (no extra
 * test runner required in CI). Validates, against the migrated database:
 *
 *   1. Schema validity — all core tables / columns / tracking table exist.
 *   2. Constraint enforcement — bad modes, negative counters, oversized
 *      payloads and out-of-range scores are REJECTED; good rows ACCEPTED.
 *   3. RLS posture — RLS enabled on every table, ≥1 policy per table,
 *      trigger functions are SECURITY DEFINER with explicit search_path.
 *   4. Trigger workflow — inserting into auth.users auto-creates a
 *      pp_user_profiles row via handle_new_user().
 *   5. Adversarial RLS — no allow-all SELECT/UPDATE/DELETE policies on
 *      history/profiles, anon cannot touch another user's rows,
 *      anon cannot spoof user_id on log insert.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node supabase/tests/verify.js
 *   npm run db:verify
 *
 * Exit code 0 = all checks pass; 1 = at least one failure (names printed).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- plain-Node runner, no bundler/TS imports */
const EXPECTED_TABLES = [
  'optimization_logs',
  'pp_optimization_history',
  'pp_saved_prompts',
  'pp_user_profiles',
  'guest_usage',
];

const OPTIONAL_TABLES = ['pp_users', 'pp_guest_sessions']; // legacy variants

const EXPECTED_CONSTRAINTS = [
  ['optimization_logs', 'optimization_logs_mode_check'],
  ['optimization_logs', 'optimization_logs_lengths_nonneg'],
  ['optimization_logs', 'optimization_logs_prompt_score_range'],
  ['optimization_logs', 'optimization_logs_session_nonempty'],
  ['pp_optimization_history', 'pp_optimization_history_mode_check'],
  ['pp_optimization_history', 'pp_optimization_history_payload_bounds'],
  ['pp_saved_prompts', 'pp_saved_prompts_mode_check'],
  ['pp_saved_prompts', 'pp_saved_prompts_payload_bounds'],
  ['guest_usage', 'guest_usage_count_nonneg'],
  ['guest_usage', 'guest_usage_guest_id_nonempty'],
];

const EXPECTED_INDEXES = [
  'idx_optimization_logs_session_id',
  'idx_optimization_logs_user_created',
  'idx_pp_optimization_history_session_id',
  'idx_pp_optimization_history_share_id',
  'idx_pp_optimization_history_user_created',
  'idx_pp_saved_prompts_user_created',
  'idx_pp_saved_prompts_user_updated',
  'idx_pp_user_profiles_email',
  'guest_usage_guest_id_unique',
];

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  ✅ ${name}`);
}
function fail(name, detail = '') {
  failed += 1;
  failures.push(name);
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Missing DATABASE_URL. See supabase/README.md.');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({
    connectionString: databaseUrl,
    // EGM E5 (F5-05): verify TLS by default; PGSSL_INSECURE=1 is the
    // deliberate escape hatch (same contract as migrate.js).
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl)
      ? false
      : { rejectUnauthorized: process.env.PGSSL_INSECURE !== '1' },
  });
  await client.connect();

  try {
    console.log('\n1️⃣  Schema validity');
    for (const table of EXPECTED_TABLES) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [table],
      );
      if (rowCount === 1) ok(`table public.${table} exists`);
      else fail(`table public.${table} exists`);
    }
    for (const table of OPTIONAL_TABLES) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [table],
      );
      console.log(`  ℹ️  optional table public.${table}: ${rowCount === 1 ? 'present' : 'absent (ok)'}`);
    }
    {
      const { rowCount } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'`,
      );
      if (rowCount === 1) ok('tracking table supabase_migrations.schema_migrations exists');
      else fail('tracking table supabase_migrations.schema_migrations exists');
    }

    console.log('\n2️⃣  RLS posture (enabled + policies present)');
    for (const table of EXPECTED_TABLES) {
      const { rows } = await client.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relname=$1`,
        [table],
      );
      if (rows[0] && (rows[0].relrowsecurity || rows[0].relforcerowsecurity)) {
        ok(`RLS enabled on ${table}`);
      } else {
        fail(`RLS enabled on ${table}`);
      }
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1`,
        [table],
      );
      if (rowCount >= 1) ok(`${table} has ${rowCount} RLS polic(y/ies)`);
      else fail(`${table} has RLS policies`);
    }

    console.log('\n3️⃣  Constraints + indexes');
    for (const [table, constraint] of EXPECTED_CONSTRAINTS) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname='public' AND t.relname=$1 AND c.conname=$2`,
        [table, constraint],
      );
      if (rowCount === 1) ok(`constraint ${table}.${constraint}`);
      else fail(`constraint ${table}.${constraint}`);
    }
    for (const index of EXPECTED_INDEXES) {
      const { rowCount } = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname=$1`, [index]);
      if (rowCount === 1) ok(`index ${index}`);
      else fail(`index ${index}`);
    }

    console.log('\n4️⃣  Trigger-function hardening');
    {
      const { rows } = await client.query(
        `SELECT prosecdef, proconfig FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='handle_new_user'`,
      );
      if (rows.length === 0) {
        fail('handle_new_user() exists');
      } else {
        ok('handle_new_user() exists');
        if (rows[0].prosecdef) ok('handle_new_user() is SECURITY DEFINER');
        else fail('handle_new_user() is SECURITY DEFINER');
        const config = (rows[0].proconfig || []).join(',');
        if (config.includes('search_path')) ok('handle_new_user() sets search_path');
        else fail('handle_new_user() sets search_path');
      }
    }
    {
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='pp_set_updated_at'`,
      );
      if (rowCount === 1) ok('pp_set_updated_at() exists');
      else fail('pp_set_updated_at() exists');
    }

    console.log('\n5️⃣  Constraint enforcement (negative tests, rolled back)');
    // Each negative probe runs inside its own SAVEPOINT: a rejected INSERT
    // aborts only the savepoint, not the enclosing transaction, so later
    // probes still execute. Without this, the first expected failure would
    // poison the whole transaction ("current transaction is aborted").
    async function expectReject(name, sql, params = []) {
      await client.query('SAVEPOINT verify_probe');
      try {
        await client.query(sql, params);
        await client.query('RELEASE SAVEPOINT verify_probe');
        fail(name);
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT verify_probe');
        ok(name);
      }
    }
    await client.query('BEGIN');
    try {
      // Valid row accepted.
      await client.query(
        `INSERT INTO public.pp_optimization_history
           (session_id, prompt_original, prompt_optimized, mode)
         VALUES ('verify-session', 'original prompt', 'optimized prompt', 'better')`,
      );
      ok('accepts valid history row');

      await expectReject(
        'rejects invalid history mode',
        `INSERT INTO public.pp_optimization_history
           (session_id, prompt_original, prompt_optimized, mode)
         VALUES ('verify-session', 'o', 'p', 'not-a-mode')`,
      );

      await expectReject(
        'rejects oversized prompt_original',
        `INSERT INTO public.pp_optimization_history
           (session_id, prompt_original, prompt_optimized, mode)
         VALUES ('verify-session', repeat('x', 60001), 'p', 'better')`,
      );

      await expectReject(
        'rejects negative optimization_count',
        `INSERT INTO public.guest_usage (guest_id, optimization_count)
         VALUES ('verify-guest-neg', -1)`,
      );

      await expectReject(
        'rejects prompt_score > 100',
        `INSERT INTO public.optimization_logs
           (session_id, mode, version, provider, model, prompt_length, prompt_score)
         VALUES ('verify-session', 'better', 'v', 'gemini', 'test-model', 10, 101)`,
      );

      // Legacy regression: 'production' mode must be accepted.
      await client.query(
        `INSERT INTO public.optimization_logs
           (session_id, mode, version, provider, model, prompt_length)
         VALUES ('verify-session', 'production', 'v', 'gemini', 'test-model', 10)`,
      );
      ok("accepts 'production' log mode");

      await expectReject(
        'rejects invalid log mode',
        `INSERT INTO public.optimization_logs
           (session_id, mode, version, provider, model, prompt_length)
         VALUES ('verify-session', 'bogus', 'v', 'gemini', 'test-model', 10)`,
      );
    } finally {
      await client.query('ROLLBACK');
    }

    console.log('\n6️⃣  Adversarial RLS (policy content + anon probes, rolled back)');
    // 7a. Policy content: no permissive USING/WITH CHECK outside the
    // guarded guest INSERTs. Catalog-level, role-independent.
    async function expectNoPolicies(name, sql, params = []) {
      const { rows } = await client.query(sql, params);
      if (rows.length === 0) ok(name);
      else fail(name, `found: ${rows.map((r) => r.policyname).join(', ')}`);
    }
    await expectNoPolicies(
      'no SELECT/UPDATE/DELETE policies on pp_optimization_history',
      `SELECT policyname FROM pg_policies WHERE schemaname='public'
       AND tablename='pp_optimization_history' AND cmd IN ('SELECT','UPDATE','DELETE')`,
    );
    await expectNoPolicies(
      'guarded INSERT policies forbid user_id spoofing (EGM E2)',
      `SELECT policyname FROM pg_policies WHERE schemaname='public'
       AND tablename IN ('pp_optimization_history','optimization_logs')
       AND policyname LIKE '%guarded%'
       AND (with_check IS NULL OR position('user_id' in with_check)=0)`,
    );
    await expectNoPolicies(
      'history guarded INSERT forbids share_id spoofing (EGM E2)',
      `SELECT policyname FROM pg_policies WHERE schemaname='public'
       AND tablename='pp_optimization_history' AND cmd='INSERT'
       AND policyname LIKE '%guarded%'
       AND (with_check IS NULL OR position('share_id' in with_check)=0)`,
    );
    await expectNoPolicies(
      'history INSERT policies all constrain session_id',
      `SELECT policyname FROM pg_policies WHERE schemaname='public'
       AND tablename='pp_optimization_history' AND cmd='INSERT'
       AND (with_check IS NULL OR position('session_id' in with_check)=0)`,
    );
    await expectNoPolicies(
      'no uid-less SELECT/UPDATE policies on pp_user_profiles',
      `SELECT policyname FROM pg_policies WHERE schemaname='public'
       AND tablename='pp_user_profiles' AND cmd IN ('SELECT','UPDATE','DELETE')
       AND (qual IS NULL OR position('uid()' in qual)=0)`,
    );
    // 7b. Behavioral probes as anon. Needs the Supabase anon role;
    // skip (informational) on stub instances without it.
    await client.query('BEGIN');
    try {
      const { rowCount: anonExists } = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname='anon'`,
      );
      if (anonExists === 0) {
        console.log('  ℹ️  no anon role on this instance — anon probes skipped');
      } else {
        // Emulate Supabase's platform privileges INSIDE this rolled-back
        // transaction (cierre EGM, Goldfish P1): on Supabase, anon and
        // authenticated hold DML grants on public tables and RLS alone
        // governs which rows they can touch. Plain Postgres (CI db.yml,
        // local ephemeral clusters) grants nothing, so without this every
        // probe below dies with "permission denied" before RLS is ever
        // consulted — testing the harness, not the policies. The grants
        // roll back together with the probes.
        await client.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated`,
        );
        await client.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated`,
        );
        await client.query(
          `INSERT INTO public.pp_optimization_history
             (session_id, prompt_original, prompt_optimized, mode)
           VALUES ('adv-victim', 'original prompt', 'optimized prompt', 'better')`,
        );
        await client.query('SET LOCAL ROLE anon');
        const upd = await client.query(
          `UPDATE public.pp_optimization_history SET prompt_original='pwned'
           WHERE session_id='adv-victim'`,
        );
        if (upd.rowCount === 0) ok("anon cannot UPDATE another user's history row");
        else fail("anon cannot UPDATE another user's history row", `${upd.rowCount} row(s) touched`);
        const sel = await client.query(
          `SELECT id FROM public.pp_optimization_history WHERE session_id='adv-victim'`,
        );
        if (sel.rowCount === 0) ok('anon cannot SELECT history rows');
        else fail('anon cannot SELECT history rows', `${sel.rowCount} row(s) visible`);
        const del = await client.query(
          `DELETE FROM public.pp_optimization_history WHERE session_id='adv-victim'`,
        );
        if (del.rowCount === 0) ok('anon cannot DELETE history rows');
        else fail('anon cannot DELETE history rows', `${del.rowCount} row(s) deleted`);
        const prof = await client.query(`SELECT id FROM public.pp_user_profiles LIMIT 1`);
        if (prof.rowCount === 0) ok('anon cannot SELECT profiles (0 rows visible)');
        else fail('anon cannot SELECT profiles', `${prof.rowCount} row(s) visible`);
        await client.query('RESET ROLE');
        // user_id spoofing on log insert (WITH CHECK violation raises).
        // Goldfish P1 (cierre EGM): each negative probe runs in its OWN
        // savepoint — a rejected INSERT aborts the whole transaction
        // (25P02 on the next statement), which would poison the positive
        // probes below and fail verify precisely when the RLS fix IS
        // applied. Same pattern as expectReject in §5; the SET LOCAL ROLE
        // stays outside the savepoint so a rollback cannot undo it.
        await client.query('SET LOCAL ROLE anon');
        async function expectInsertReject(name, sql) {
          await client.query('SAVEPOINT adv_probe');
          try {
            await client.query(sql);
            await client.query('RELEASE SAVEPOINT adv_probe');
            fail(name);
          } catch {
            await client.query('ROLLBACK TO SAVEPOINT adv_probe');
            ok(name);
          }
        }
        await expectInsertReject(
          'anon cannot spoof user_id on log insert',
          `INSERT INTO public.optimization_logs
             (session_id, mode, version, provider, model, prompt_length, user_id)
           VALUES ('adv-spoof', 'better', 'v', 'gemini', 'test-model', 10,
                   '22222222-2222-4222-8222-222222222222')`,
        );
        await client.query(
          `INSERT INTO public.optimization_logs
             (session_id, mode, version, provider, model, prompt_length, user_id)
           VALUES ('adv-guest', 'better', 'v', 'gemini', 'test-model', 10, NULL)`,
        );
        ok('anon guest log insert (NULL user_id) still accepted');
        // EGM E2: identity spoofing through the GUARDED history policy —
        // before 20261112000000 these INSERTs were allowed (OR semantics).
        await expectInsertReject(
          'anon cannot spoof user_id on history insert',
          `INSERT INTO public.pp_optimization_history
             (session_id, prompt_original, prompt_optimized, mode, user_id)
           VALUES ('adv-spoof-h', 'a', 'b', 'better',
                   '22222222-2222-4222-8222-222222222222')`,
        );
        await expectInsertReject(
          'anon cannot pre-claim a share_id on history insert',
          `INSERT INTO public.pp_optimization_history
             (session_id, prompt_original, prompt_optimized, mode, share_id)
           VALUES ('adv-spoof-s', 'a', 'b', 'better', 'advshare123456')`,
        );
        await client.query(
          `INSERT INTO public.pp_optimization_history
             (session_id, prompt_original, prompt_optimized, mode)
           VALUES ('adv-guest-h', 'a', 'b', 'better')`,
        );
        ok('anon guest history insert (NULL identity) still accepted');
        await client.query('RESET ROLE');
      }
    } finally {
      await client.query('ROLLBACK');
    }

    console.log('\n7️⃣  Signup-trigger workflow (auth.users → profile)');
    await client.query('BEGIN');
    try {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema='auth' AND table_name='users'`,
      );
      if (rows.length === 0) {
        console.log('  ℹ️  no auth.users on this instance (Supabase-only) — skipped');
      } else {
        const testId = '11111111-1111-4111-8111-111111111111';
        await client.query(
          `INSERT INTO auth.users (id, email, raw_user_meta_data)
           VALUES ($1, 'verify@example.com', '{"full_name":"Verify User"}')
           ON CONFLICT (id) DO NOTHING`,
          [testId],
        );
        const { rowCount } = await client.query(
          `SELECT 1 FROM public.pp_user_profiles WHERE id=$1`,
          [testId],
        );
        // NOTE: the stock template trigger was removed in
        // 20250410000000; on Supabase the app trigger recreates the
        // profile. On a stub instance the trigger may be absent, so a
        // missing row is informational, not a failure.
        console.log(
          rowCount === 1
            ? '  ✅ auth.users insert auto-created pp_user_profiles row'
            : '  ℹ️  no profile auto-created (trigger absent on this instance) — skipped',
        );
        if (rowCount === 1) passed += 1;
      }
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();
  }

  console.log(`\n${'='.repeat(52)}\nResult: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('🎉 Database verification passed.');
}

main().catch((err) => {
  console.error('Verification error:', err && err.message ? err.message : err);
  process.exit(1);
});
