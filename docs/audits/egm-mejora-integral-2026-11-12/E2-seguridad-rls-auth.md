# E2 — Seguridad/Auth/RLS: cerrar spoofing, reset y scan sin relajar nada
## Prompt exacto
«PromptPerfect (Supabase RLS, ADR-0005/0006/0009): diseña las correcciones que cierran el spoofing de user_id por políticas permisivas combinadas, la exposición del enlace de recuperación por cabeceras falsificables y la escapada por symlink del local-scan, sin aflojar RLS/rate-limit/CSP/auth y sin aplicar migraciones a producción.»
## Brief
Hallazgos: F2-02, F2-03(parcial), F2-05, F2-06, F2-09, F2-11(DOC). Patrones: PP-21, PP-22, PP-24, PP-25, PP-28. Pendientes que NO se implementan aquí: F2-01 (gate de /api/optimize), F2-04 (rate-limit distribuido), F2-08 (BYOK en reposo) — decisión de Carlos.
## Draft v1
1. F2-02: migración nueva `20261112000000_close_guarded_policy_spoofing.sql`: DROP+CREATE de `opt_logs_guest_insert_guarded` y `pp_history_guest_insert_guarded` añadiendo `user_id IS NULL` al WITH CHECK (y `share_id IS NULL` en history), siguiendo el patrón DROP IF EXISTS del hardening 20261018. NO se aplica a ninguna BD desde este programa; su aplicación queda «pendiente de decisión» y la verifica el job db.yml en CI. verify.js gana probes anon: INSERT con user_id ajeno en history debe ser rechazado; INSERT con share_id pre-fijado debe ser rechazado (espejo del probe de logs existente).
2. F2-03: `parseFeedbackBody` exige `feedback ∈ {up, down}` (400 en caso contrario) — la columna es texto sin CHECK y el único uso legítimo es el voto.
3. F2-05/F2-06: forgot-password solo incluye `recoveryLink` si `NODE_ENV !== 'production'` Y el redirect es loopback (la cabecera deja de bastar en producción); el 503 pierde el `hint` con instrucciones internas (se mantiene `code`); `googleOnlyHint` sale de la respuesta pública (anti-enumeración) y la página deja de consumirlo.
4. F2-09: localScan resuelve `fs.realpathSync` de la raíz antes de `isPathAllowed` y el walk genérico deniega nombres de secreto (`*.pem`, `*.key`, `id_rsa*`, `credentials*.json`, `.env*` ya existía) reutilizando la lista del audit=system.
5. F2-11 DOC: addendum fechado en SECURITY_AUDIT.md: documento histórico (2026-05-16, +addendum 2026-10-14), cobertura real 9/22 rutas, afirmaciones superadas listadas; los veredictos originales no se reescriben.
Pruebas: passwordResetRedirect/forgot route tests actualizados, apiSchemas.test (enum feedback), localScan sin tests previos → se añade test unitario de realpath/denylist si la estructura lo permite sin BD; verify.js `node --check`; migración revisada por Goldfish (no ejecutable sin BD — declarado).
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes: (1) NODE_ENV!=='production' no basta como barrera única para recoveryLink; (2) la migración debe copiar el WITH CHECK de 20261012 verbatim + IS NULL y auditar TODAS las políticas INSERT permisivas de ambas tablas; probe de catálogo en verify.js, no solo conductuales; (3) realpath debe resolver ambos lados, en la ruta, con fs.realpath (promises) y error mapeado — si no, rompe tests con tmpdir de macOS.
## Resolve (diseño v2)
1. recoveryLink solo si NODE_ENV!=='production' Y isUnlimitedMode() (opt-in del repo) Y redirect loopback, aplicado a AMBAS ramas (éxito y error de email). El 503 y la rama 400 pierden sus hint con instrucciones internas; googleOnlyHint fuera.
2. Migración: WITH CHECK copiado verbatim de 20261012 + `user_id IS NULL` (ambas) + `share_id IS NULL` (history). Análisis de "Allow anon insert" (logs, TO PUBLIC, `user_id IS NULL OR user_id = auth.uid()`): para anon auth.uid() es NULL → equivale a IS NULL; para authenticated solo permite su propio id → el OR con la guarded corregida queda seguro; queda escrito en la cabecera de la migración. verify.js: probes conductuales anon en history (spoof user_id, share_id pre-fijado) + probe de catálogo pg_policies.with_check contiene 'user_id' en ambas guarded. Patrón citado corregido: las guarded nacen en 20261012.
3. localScan: la RUTA resuelve con fs.realpath la raíz pedida y cada root permitido antes de isPathAllowed y pasa la ruta resuelta al escaneo; raíz inexistente → 403. Denylist antes de listar (nombre/tamaño también filtran): *.pem, *.key (daño colateral declarado: ficheros Keynote .key), id_rsa*, .git-credentials, credentials*.
## Review-loop
Verificado por Goldfish: el invitado legítimo inserta sin user_id (navegador) y share_id solo se escribe por UPDATE con admin → los IS NULL no rompen flujos reales. APTO v2.
