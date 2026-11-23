# E1 — Arquitectura/API: verdad del proveedor y contrato de rutas
## Prompt exacto
«PromptPerfect (Next 16, AI SDK 6, ADR-0001/0002): la ruta reina /api/optimize ignora el proveedor que el cliente envía y etiqueta mal el resultado. Diseña el incremento mínimo que haga a las rutas de optimización decir la verdad (proveedor, modelo, errores, timeouts, salud) sin romper el free-tier guest ni la extensión, con pruebas ejecutables por cambio.»
## Brief (concepts_brief)
Hallazgos: F1-01, F1-03, F1-04, F1-05(parcial), F3-03, F3-04, F3-05, F3-06, F3-12(parcial), B-01. Patrones: PP-09, PP-10, PP-14, PP-27, PP-29.
## Draft (design_draft v1)
1. B-01: `legacyInsert` de feedback pasa al patrón spread condicional `...(authUserId ? {user_id: authUserId} : {})` ya usado en el mismo fichero; feedback «not configured» 500→503.
2. F1-01: `/api/optimize` destructura `provider` de `parseOptimizeBody`, llama `createProvider(provider, apiKey)`, aplica `...getProviderCallOptions(provider)` a `streamText`, registra `provider` real en `optimization_logs` (no 'gemini') y devuelve `toTextStreamResponse({ headers: { 'x-promptperfect-provider': provider, 'x-promptperfect-model': modelId } })` — las cabeceras que el cliente ya lee.
3. F3-03: `streamText({ onError })` → `recordProviderFailure()` + `logWarn` con mensaje saneado y requestId.
4. F3-04: `abortSignal: AbortSignal.timeout(45_000)` en optimize, optimize-sync y translate; `userFacingOptimizeError` mapea Timeout/Abort a copy accionable.
5. F3-05/F3-06: `userFacingOptimizeError(err, provider)` con ramas por proveedor (sin referencias a `.env` para BYOK); sanitizador ampliado (`sk-ant-`, `x-api-key`, `"api_key":"…"`); optimize usa el sanitizador al loguear; el catch de sync loguea con requestId.
6. F1-03: `parseSaveHistoryBody` acota `explanation` ≤20 000, `session_id` ≤300 (espejo de CHECKs 20261012) y las rutas history/save-history aplican `normalizeModeForDb` antes de insertar.
7. F1-04: `getServiceClient()` devuelve `null` sin service key (como el admin); cada llamante ya comprueba null o se ajusta el que no lo haga.
Pruebas: route.test de optimize (proveedor respetado + cabeceras + onError), feedback route.test, apiSchemas.test (topes), optimizeUserError.test (por proveedor), providers.test intacto. Gate por incremento: tests focalizados → suite completa → typecheck/lint/build.
## Review Goldfish fresco
PENDIENTE — se registra en la sección tras la revisión.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes: (1) honrar proveedor sin gate abre gasto anónimo de claves OpenAI/Anthropic del servidor; (2) getServiceClient: la tabla de consecuencias por llamante debe ser explícita; (3) timeout en streaming sin semántica (el error no pasa por el catch; onError contaría desconexiones como fallos de proveedor); (4) history POST no usa el parser compartido; (5) «acotar» ambiguo (¿slice o 400?); (6) firma de userFacingOptimizeError y mapeo de timeout contra errores reales; sk- ya cubre sk-ant-.
## Resolve (diseño v2, aceptado íntegro)
1. Proveedor ≠gemini solo con apiKey presente O sesión (resolveIdentity); sin ninguna, se degrada a gemini y las cabeceras dicen gemini (verdad, sin romper el free-tier guest). Gemini sigue como hoy.
2. getServiceClient sin fallback anon, con tabla de consecuencias: optimize (insert de log se omite, ya guardado), feedback (503), guest-usage (503), share page (Service Unavailable), feedback/status (error explícito).
3. Timeout: solo en rutas generateText (optimize-sync, translate) vía abortSignal 45 s con mapeo por nombre real del error (TimeoutError/AbortError); en streaming NO se impone abortSignal — manda maxDuration=60 de plataforma — y onError filtra AbortError (desconexión de cliente no es fallo de proveedor).
4. history POST: se le aplican los mismos topes con rechazo 400 (explanation >20 000, session_id >300) + normalizeModeForDb, sin migrarlo al parser (su forma difiere); parseSaveHistoryBody rechaza con 400, no recorta, salvo session_id que sigue la convención slice del parser de optimize (declarado).
5. userFacingOptimizeError(err, provider?) — provider opcional, default gemini: translate/sync lo pasan; tests con errores de nombre real.
6. Sanitizador: se añaden patrón de cabecera x-api-key y de "api_key":"…" en JSON (sk-ant- ya lo cubre sk-).
## Review-loop
Goldfish verificó contra código: toTextStreamResponse(init) existe en ai@6, abortSignal compatible, CHECKs citados reales, llamantes de getServiceClient comprueban null. Con el resolve v2 el diseño queda APTO para implementar.
