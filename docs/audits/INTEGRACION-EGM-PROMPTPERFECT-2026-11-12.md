# Integración EGM — PromptPerfect · 2026-11-12

**Programa:** Mejora integral EGM (google/elephant-goldfish-model, «Try your first design») sobre PromptPerfect v0.1.0.
**Árbol:** `/Users/klosraf/Proyecto/promptperfect` (Mac de Carlos, ServerK.local), rama `feat/db-production-hardening`, HEAD `e6a5d4a740a7fd9ea3fddc45fd68caab5bfa8dcd` — **sin commit, sin push, sin merge**.
**Método:** sustitución declarada — plugin EGM no adoptado in-repo; línea ejecutada con Elephant (coordinador con contexto) + subagentes Goldfish de contexto fresco. `.env.local` nunca abierto. `../CONSTITUCION.md` solo lectura.
**Cierre:** el coordinador original terminó sin informe final (fallos SSH exit 255 cerca del cierre, con sus 6 hijos completados). Este documento lo escribe el **coordinador de cierre** (2026-11-12), que ejecutó la Fase 5 completa, completó en el cierre los incrementos E6/E7 y tres cierres P2 que el cruce inventario×diff demostró no aterrizados (declarados como «incrementos de cierre», no retrofechados), y obtuvo un Goldfish fresco del diff final.

## 1. Resumen por fases

- **Fase 0 — Línea base real ejecutada** (Mac, Node v24.22.1): tests 511/511 (85 ficheros); typecheck ROJO (1 error TS2345, `src/app/api/feedback/route.ts:123`); lint ROJO (12 errores `react-hooks/set-state-in-effect`); build ROJO (consecuencia del TS2345); cobertura crítica 62 tests / 4 ficheros; `perf:budget` verde solo sobre `.next` preexistente; e2e no ejecutable (build roto); Docker no verificable (daemon inactivo); `db:verify` no ejecutable (sin DATABASE_URL local).
- **Fase 1 — Exploración global** → `docs/EXPLORACION-GLOBAL-PROMPTPERFECT-2026-11-12.md`: 42 patrones PP-01…PP-42 mapeados por área con veredicto (DEBE/PUEDE/DESCARTAR con motivo).
- **Fase 2 — Auditoría EGM extrema** → `docs/audits/AUDITORIA-EGM-EXTREMA-PROMPTPERFECT-2026-11-12.md`: 3 Goldfish frescos cubriendo 6 frentes + verificación propia del coordinador; inventario maestro B-01…B-04, F1-01…F6-11 con disposición explícita por ítem.
- **Fase 3 — Enfoques EGM** → `docs/audits/egm-mejora-integral-2026-11-12/`: E1–E7, cada uno con prompt exacto, brief, draft, review Goldfish fresco (todos «APTO CON CAMBIOS»), resolve con diseño v2 y review-loop APTO v2. Addendum registrado en `enfoque-04-ux-accesibilidad.md` (3 desactivaciones eslint puntuales firmadas en vez de las 2 estimadas).
- **Fase 4 — Implementación**: E1–E5 aterrizaron en el árbol del coordinador original (52 ficheros trackeados + ficheros nuevos). El cruce del cierre demostró que **E6 y E7, con diseño APTO v2, no habían aterrizado** (CI sin `perf:budget`, guard de db.yml sin dientes, healthcheck divergente, guest.ts fuera del gate crítico, extensión con la clave BYOK aún en `chrome.storage.sync` y default personal) y que tres parciales P2 tampoco (F3-08, F3-11, cifra DOC de F4-08 / declaración F6-10). El coordinador de cierre los implementó según los diseños APTO v2 ya aprobados (incrementos de cierre, §5) y re-verificó.
- **Fase 5 — Verificación final y este informe** (coordinador de cierre): §2, §6, §7.

## 2. Gates: antes → después (ejecutados en el Mac, 2026-11-12)

| Gate | Baseline (Fase 0) | Final (Fase 5, cierre) |
|---|---|---|
| `npm run typecheck` | ❌ 1 error TS2345 (feedback:123) | ✅ 0 errores (corrida final 05:56 MST) |
| `npm run lint` (`--max-warnings=0`) | ❌ 12 errores set-state-in-effect | ✅ 0 errores, 0 warnings (corrida final 05:56 MST) |
| `npm run test:run` | ✅ 511/511, 85 ficheros (132,59 s) | ✅ **543/543, 88/88 ficheros** (97,00 s; corrida final 05:56 MST) — +32 tests y +3 ficheros sobre el suelo, cero regresiones |
| `npm run test:coverage:critical` | ✅ 62 tests, 4 ficheros (98,3 % stmts / 90,38 % branch agregado) | ✅ 83 tests, **5 ficheros** (per-file 95/80/90; guest.ts 100 % líneas / 88,23 % ramas / 100 % funciones) (05:58 MST) |
| `npm run build` | ❌ falla por TS2345 — la rama no compilaba | ✅ exit 0 (corrida final 05:58 MST) |
| `npm run perf:budget` | ⚠️ ✅ solo sobre `.next` viejo: 489 KB gz total / 140 máx | ✅ sobre build fresco: 531 KB gz total / 169 máx (presupuesto 550/200) — margen total reducido a 19 KB, registrado como riesgo |
| `npm run test:e2e` (Playwright) | ⛔ no ejecutable (build roto) | ✅ **8/8** (landing, login, guest quota, axe sin violaciones críticas/serias en /, /login, /docs, /app, /library) (corrida final 05:59 MST) |
| Docker build | ⛔ daemon inactivo | ⛔ daemon sigue inactivo (`docker info` exit 1) — imagen NO verificada, declarado |
| Pipeline BD (migrate → check → seed → verify) | ⛔ sin DATABASE_URL local | ✅ **ejecutado en Postgres efímero local** (clúster desechable en el Mac, ~05:52 MST): 27 migraciones aplicadas (incluidas las 2 nuevas), `--check` idempotente, seed OK, **verify 61 pasadas / 0 fallos** — incluidas las sondas anti-spoofing de E2 y la aceptación de inserts guest legítimos; RPC `increment_guest_usage` probada (1ª llamada → 1, 2ª con límite 1 → 0 filas, anon sin EXECUTE). La BD real de producción NO se tocó; aplicar allí sigue «pendiente de decisión» |

## 3. Matriz enfoque × estado

| Enfoque | Diseño EGM | Implementación | Evidencia principal |
|---|---|---|---|
| E1 Arquitectura/API | APTO v2 | ✅ Implementado | `/api/optimize` honra proveedor con gate (BYOK o sesión; si no, degrada a Gemini y las cabeceras dicen Gemini), emite `x-promptperfect-provider/model`, `onError`→`recordProviderFailure`, timeouts 45 s en rutas sync, errores por proveedor, sanitizador ampliado, `getServiceClient()` sin fallback anon, topes espejo de CHECKs + `normalizeModeForDb`, B-01 corregido |
| E2 Seguridad/RLS/auth | APTO v2 | ✅ Implementado (migración no aplicada) | Migración `20261112000000` (guarded + `user_id IS NULL` + `share_id IS NULL`, WITH CHECK verbatim de 20261012), probes en verify.js, enum feedback `up\|down`, forgot-password sin `recoveryLink` salvo dev+unlimited+loopback y sin hints internos/`googleOnlyHint`, local-scan con `realpath` en ruta + denylist de secretos, addendum SECURITY_AUDIT.md |
| E3 IA/modelos | APTO v2 | ✅ Implementado con 1 descarte motivado del propio diseño | `src/lib/modelCatalog.ts` fuente única (providers + config; `/api/config` expone Anthropic), logout borra claves locales (`clearStoredApiKeys`), F3-10: la eliminación de `parsePromptScore` se DESCARTÓ en resolve (no era código muerto) y la dualidad queda documentada; F3-08/F3-11 completados en el cierre (§5) |
| E4 UX/a11y | APTO v2 | ✅ Implementado | 12 `set-state-in-effect` corregidos por patrón real (useMounted compartido, ajustes en render con clave primitiva, cargas tras await; 3 desactivaciones puntuales firmadas y declaradas en addendum), focus-trap en `ui/Modal` + tests, `role="alert"` + reintento en /app, `aria-live` de fin de streaming, búsqueda por texto en TemplatesTab, emojis→puntos tokenizados |
| E5 Datos/guest/claim | APTO v2 | ✅ Implementado (migración no aplicada) | Migración `20261112000001` RPC atómica `increment_guest_usage` (search_path fijo, REVOKE PUBLIC/anon/authenticated, solo service_role), ruta rpc-first con fallback legado solo ante PGRST202/42883, claim sin admin → 503 honesto, cliente de claim sin vía 3 y sin borrar storage tras fallo, migrate.js registra migraciones vacías + TLS verificado por defecto (`PGSSL_INSECURE=1` único escape), addenda ADR-0004/0006, host redactado en SETUP_SHARE_FEATURE.sql |
| E6 Testing/CI/obs/Docker | APTO v2 | ✅ Implementado **en el cierre** (§5) | `perf:budget` cableado en el job build de ci.yml, trigger de CI/db también en `feat/db-production-hardening`, guard de db.yml por contenido con `exit 1`, guest.ts+guest.test.ts en el gate crítico, healthcheck de compose a `/api/healthz`, comentario veraz en Dockerfile, alcance e2e honesto en README |
| E7 Extensión/integraciones | APTO v2 | ✅ Implementado **en el cierre** (§5) | Clave BYOK solo en `chrome.storage.local` con migración en lectura en popup y service worker (local.set → sync.remove), prefs no sensibles en sync, default canónico `https://promptperfect.vercel.app` en los 5 sitios enumerados (sin tocar manifest ni allowlist CORS), guía de credenciales n8n en examples/README; verificación: `node --check` en ambos JS + grep de invariantes (sin daemon/infra de tests de extensión — declarado) |

## 4. Inventario maestro cerrado (disposición final por ítem)

Clave: ✅ corregido con evidencia · 📄 DOC factual · ⏸ DIFERIDO con motivo registrado · 🗳 PENDIENTE DE DECISIÓN · 🚫 DESCARTAR con motivo.

### Baseline
- B-01 ✅ (E1) · B-02 ✅ (E4) · B-03 ✅ vía B-01 (build verde) · B-04 🗳 ficheros pnpm no trackeados: no adoptados, no borrados, no commiteados.

### F1 Arquitectura/API
- F1-01 ✅ · F1-02 ⏸ unificación de validación (riesgo de regresión sin ganancia inmediata) · F1-03 ✅ · F1-04 ✅ · F1-05 ✅ parcial (feedback 503; resto ⏸) · F1-06 ⏸ wrapper de tamaño de cuerpo · F1-07 🗳 CORS/OPTIONS global (tocar CORS de la extensión sin e2e de extensión) · F1-08 ⏸ profile GET · F1-09 ⏸ deriva menor ADR-0001.

### F2 Seguridad/Auth/RLS
- F2-01 🗳 (=F3-02) cerrar/cuota server-side de `/api/optimize` con clave del servidor = decisión de producto/coste · F2-02 ✅ migración creada (aplicación 🗳) · F2-03 ✅ parcial (enum; ownership de session_id 🗳) · F2-04 🗳 rate-limit distribuido = decisión de infraestructura · F2-05 ✅ · F2-06 ✅ · F2-07 ✅ vía E5 + 📄 ADR-0006 (la re-acuñación de guestId queda documentada como fricción, no control) · F2-08 🗳 (=F3-01 server) cifrar o dejar de persistir BYOK en `pp_users` · F2-09 ✅ · F2-10 deuda declarada (CSP `unsafe-inline`; nonce = programa propio PP-26) · F2-11 📄 addendum · F2-12 🗳 revocación/caducidad de share (producto); separación de `Authorization` ⏸.

### F3 IA/proveedores/modos
- F3-01 🗳 persistencia server; ✅ parcial: logout borra la clave local + comentario veraz en types.ts · F3-02 = F2-01 🗳 · F3-03 ✅ · F3-04 ✅ (streaming queda bajo `maxDuration` de plataforma por resolve v2, sin abortSignal impuesto) · F3-05 ✅ · F3-06 ✅ · F3-07 ⏸ elevar modos exige golden set (PP-03) previo · F3-08 ✅ en el cierre (declaración `title` en el selector, ambas variantes; una descripción inline permanente queda como mejora de diseño futura) · F3-09 ✅ catálogo único · F3-10 🚫 eliminación de `parsePromptScore` descartada en resolve Goldfish (no era código muerto: se aplica al texto crudo y alimenta stats); dualidad documentada · F3-11 ✅ parcial en el cierre (dedupe de remediation con helper puro + tests; léxico ES y coste real ⏸) · F3-12 ✅ parcial (`getProviderCallOptions` aplicado en ambas rutas; tope `maxOutputTokens` solo OpenAI — extenderlo exige máximos por modelo verificados: p. ej. el tope de 16 000 no es válido para todos los modelos Anthropic; queda registrado, no improvisado) · F3-13 ⏸ verify-key por metadatos.

### F4 UX/diseño/a11y
- F4-01 ✅ (=B-02) · F4-02 ⏸ migrar diálogos artesanales a Modal (riesgo visual sin e2e autenticado; la primitiva sí se corrigió) · F4-03 ✅ focus-trap · F4-04 ⏸ codemod de tokens ADR-0008 = programa propio · F4-05 ✅ parcial (emojis→puntos); contraste 🗳 sign-off de diseño de Carlos · F4-06 📄 alcance real en README + ⏸ escenarios autenticados · F4-07 ✅ · F4-08 ✅ (búsqueda en TemplatesTab; cifra README corregida en el cierre: 75 plantillas) · F4-09 ⏸ historial móvil (decisión de diseño); Skeleton no adoptado al no ser trivial en ese panel · F4-10 ✅ aria-live.

### F5 Datos/Supabase
- F5-01 📄 addendum ADR-0004 (27 migraciones a 2026-11-12 tras las 2 nuevas) · F5-02 📄 fuera la cifra «47 assertions» · F5-03 ✅ · F5-04 ⏸ checksum de migraciones (sin BD local para verificar) · F5-05 ✅ TLS · F5-06 🗳 convergencia de esquema guest_usage + 📄 addendum veraz ADR-0006 · F5-07 📄 nota de limitación de replay · F5-08 ✅ host redactado + guard con `exit 1` (cierre) · F5-09 ✅ RPC + ruta (aplicación 🗳) · F5-10 ✅ parcial (503 honesto; backfill de perfil 🗳 semántica de conteo) + 📄 · F5-11 ✅ · F5-12 🗳 (=F2-12) · F5-13 ⏸ VERIFY_STRICT.

### F6 Testing/CI/obs/perf/Docker/extensión
- F6-01 ✅ parcial en el cierre (guest.ts al gate crítico + alcance escrito en el config; coverage principal sin thresholds queda como está: el gate que manda es el crítico per-file) · F6-02 ✅ cierre · F6-03 ✅ parcial cierre (trigger de rama en ci.yml y db.yml; doble build de e2e ⏸ ineficiencia aceptada) · F6-04 📄 cierre (alcance e2e en README) · F6-05 ✅ cierre · F6-06 📄 cierre (comentario Dockerfile veraz); standalone + `USER` non-root 🗳 (sin daemon Docker no se puede verificar la imagen) · F6-07 ✅ cierre · F6-08 ⏸ live-check de healthz diseñado, no implementado (se corrigió su causa principal F3-03) · F6-09 ✅ cierre (extensión) · F6-10 📄 cierre (credenciales n8n + test huérfano declarado) · F6-11 ✅ cubierta ítem a ítem.

## 5. Incrementos de cierre (coordinador de cierre, 2026-11-12)

Declarados como ejecutados en el cierre — no formaban parte del diff del coordinador original:

1. **E6 completo** según su diseño APTO v2: ci.yml (`perf:budget` tras build; trigger de rama), db.yml (trigger de rama; guard por contenido con `exit 1` — verificado que la redacción E5 de SETUP_SHARE_FEATURE.sql, solo comentarios, pasa el guard), vitest.critical.config.ts (guest.ts/guest.test.ts, con la medición registrada en el propio config), docker-compose.yml (healthcheck `/api/healthz`), Dockerfile (comentario veraz), README (alcance e2e + gate crítico). YAML de ambos workflows parseado sin errores.
2. **E7 completo** según su diseño APTO v2: service-worker.js y popup.js/popup.html (clave solo en `storage.local`, migración en lectura en ambos lectores, default canónico en los 5 sitios; manifest.json y allowlist CORS intactos), examples/README (credenciales n8n + test huérfano declarado). Verificación: `node --check` OK en ambos JS; grep: ningún `storage.sync.set` con apiKey, ningún default beaglecorp en SW/popup.
3. **F3-11** dedupe de remediation: helper puro `appendRemediationBlock` + `REMEDIATION_MARKER` en `src/lib/remediation.ts`, usado por `useOptimizeRunner.handleRemediate`, +2 tests.
4. **F3-08** declaración del modo production en `AppModeSelector` (ambas variantes).
5. **F4-08 DOC** cifra de plantillas en README: 60 → 75 (conteo real de `PROMPT_TEMPLATES`).

Tras cada incremento: tests focalizados, typecheck y lint en verde; la verificación completa de §2 se ejecutó sobre el diff final ya con estos incrementos.

6. **Ronda Goldfish del cierre** (correcciones al dictamen de §6, todas con test o evidencia ejecutada):
   - **P1-1** `verify.js` §7b: las tres sondas negativas de INSERT (spoof en logs, spoof en history, share_id prefijado) corren ahora en su propio SAVEPOINT (`expectInsertReject`), con el `SET LOCAL ROLE anon` fuera del savepoint. Además se descubrió al demostrarlo que en Postgres plano **ningún GRANT a anon existe en el repo** (en Supabase los aporta la plataforma): §7b emula esos privilegios por defecto *dentro* de su transacción con rollback, para que las sondas prueben RLS y no el arnés (sin esto, §7b moría con «permission denied» antes de consultar RLS — preexistente en HEAD). Evidencia: pipeline completo en Postgres efímero local (§2) — verify 61/0 con las sondas de spoofing rechazando y los inserts guest aceptados.
   - **P2-1** denylist de localScan ampliada: `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `*.p12`, `*.pfx`, `*.keystore` + casos en el test de ruta existente.
   - **P2-2** claim cliente: cada fila local cuyo POST acepta el servidor se borra de localStorage al momento (aunque el claim servidor siga pendiente), así ningún login posterior la reenvía; las filas cuyo POST falla se quedan para reintento. Test nuevo: con claim 503, dos invocaciones producen un solo POST a `/api/history` y el guest id se conserva.
   - **P2-3** dedupe de remediation por **contenido del bloque** (no por marcador): un bloque distinto sí se anexa (test nuevo); el idéntico no se duplica.
   - **P3-1** comentario de `types.ts` corregido a la verdad (la clave puede persistir en el perfil; nunca se loguea).
   - **P3-2** `feedback/status` sin cliente devuelve **503 explícito** (cuerpo compatible `{submitted:false}`; test actualizado).
   - **P3-3** hint del modo production en el idioma de la UI (inglés); su visibilidad solo-`title` queda registrada como limitación (descripción inline = trabajo de diseño futuro).
   - **P3-4** el guard de db.yml ahora **falla si `git diff` falla** (base ausente), en vez de pasar en silencio.
   - **P3-5** cabecera de la migración 20261112: cita corregida a 20261018.
   - **P3-6** la sonda de catálogo de `share_id` queda acotada a políticas `guarded`, como su nombre anuncia.

## 6. Goldfish fresco del diff final

**Veredicto: APTO CON CAMBIOS** (revisor de contexto fresco, solo lectura; dictamen sobre el diff de 65 ficheros trackeados a las 05:50 MST — el diff creció durante su revisión con los incrementos de cierre 3–5, que el revisor alcanzó a revisar; los incrementos 1–2 ya estaban dentro). **Sin P0.** Un P1, tres P2 y seis P3, todos corregidos en la ronda de cierre (§5.6) y re-verificados con la corrida final de §2 sobre el árbol ya congelado (68 ficheros trackeados):

- **P1-1** (verify.js §7b envenenaba su transacción) → corregido + demostrado con el pipeline BD en verde.
- **P2-1** (denylist sin claves SSH actuales) → corregido + test.
- **P2-2** (claim duplicaba filas reenviadas) → corregido + test.
- **P2-3** (dedupe de remediation bloqueaba bloques distintos) → corregido + test.
- **P3-1…P3-6** → corregidos (P3-3 con la limitación de visibilidad registrada arriba).

El revisor confirmó además como correctos, con evidencia: ADR-0001 sin violaciones nuevas y la tabla de consecuencias de `getServiceClient()` (salvo el P3-2 ya corregido), ADR-0002 sin Zod y con la validación creciendo donde manda el ADR, B-01/B-03, F1-01 con la guarda exacta de E1 v2, ambas migraciones nuevas (WITH CHECK verbatim + IS NULL; RPC atómica válida sobre las dos formas históricas de `guest_usage`, REVOKE correcto), la puerta triple de forgot-password, el `realpath` bilateral de local-scan, el claim 503 honesto, la extensión E7 en los 5 sitios sin tocar manifest/CORS, modelCatalog como hoja pura, el cableado CI/cobertura de E6, y la higiene del programa (sin secretos en el diff, ficheros pnpm intactos, ninguna migración aplicada por el programa).

## 7. Decisiones, riesgos y límites

- **Sin commit/push/merge**: HEAD `e6a5d4a740a7fd9ea3fddc45fd68caab5bfa8dcd` intacto; el árbol queda para revisión de Carlos. Estado final (05:59 MST, antes de escribir este informe): **68 ficheros trackeados modificados (+1377/−319)** y sin trackear: los documentos del programa (`docs/EXPLORACION…`, `docs/audits/`), `src/lib/modelCatalog.ts` + test, `src/hooks/useMounted.ts`, `src/components/AppSettingsPanel.test.tsx`, `src/lib/client/claimGuestHistory.test.ts`, las 2 migraciones `20261112*` y los intocados `pnpm-lock.yaml`/`pnpm-workspace.yaml`.
- **Migraciones nuevas no aplicadas** a ninguna BD: `20261112000000_close_guarded_policy_spoofing.sql` y `20261112000001_atomic_guest_usage.sql`. Hasta aplicar la primera, el spoofing de las políticas «guarded» sigue presente en BD viva; hasta aplicar la segunda, la ruta guest-usage usa el camino legado (con log de aviso). El job db.yml las ejercita en CI con Postgres efímero.
- **Bundle**: total 530 KB gz sobre presupuesto de 550 — cualquier adición de dependencias debe mirar este margen.
- **Docker**: imagen no construida en este programa (daemon inactivo en el Mac); standalone/non-root pendientes.
- **BD**: las migraciones y probes RLS SÍ se ejecutaron (Postgres efímero local desechable, §2) — lo no verificado es solo su comportamiento contra la BD real de Supabase al aplicarlas, que es la decisión pendiente nº 3.
- **Cobertura crítica**: el margen de ramas de guest.ts (88,23 % sobre suelo 80) es estrecho; ramas nuevas en guest.ts exigen tests.

## 8. Pendiente de decisión (Carlos)

1. Merge/push de `feat/db-production-hardening` (13+ commits sobre el fork; 61/63 sobre main/origin) — incluye todo este programa cuando se commitee.
2. Ficheros no trackeados `pnpm-lock.yaml` + `pnpm-workspace.yaml`: adoptar, excluir (`.gitignore`) o borrar — npm es el gestor canónico; el programa no los tocó.
3. Aplicación de las migraciones `20261112000000` y `20261112000001` a la BD real (orden y ventana).
4. F2-01/F3-02: futuro del free-tier guest de `/api/optimize` con clave del servidor (cuota server-side, autenticación o cierre).
5. F2-04: rate-limit distribuido para despliegues multi-instancia/self-hosted.
6. F2-08/F3-01: BYOK persistida en claro en `pp_users.api_key` — cifrar en reposo o dejar de persistirla.
7. F5-06: convergencia del esquema `guest_usage` duplicado; F5-10: semántica del backfill de perfil en el claim.
8. F2-12/F5-12: revocación y caducidad de enlaces share.
9. F1-07: política CORS/OPTIONS global de `/api/*`.
10. F4-05: sign-off de contraste sub-AA residual (design-owned); F6-06: standalone + non-root en Docker cuando haya daemon para verificar la imagen.

---
*Informes del programa: exploración `docs/EXPLORACION-GLOBAL-PROMPTPERFECT-2026-11-12.md` · auditoría `docs/audits/AUDITORIA-EGM-EXTREMA-PROMPTPERFECT-2026-11-12.md` · integración: este documento. SHA-256 de los tres: declarados en el mensaje de cierre del coordinador (el de este fichero se calcula tras escribirlo).*
