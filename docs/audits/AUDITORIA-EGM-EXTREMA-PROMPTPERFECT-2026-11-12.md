# Auditoría EGM extrema — PromptPerfect · 2026-11-12

**Alcance:** HEAD `e6a5d4a` (rama `feat/db-production-hardening`), solo lectura, `.env.local` nunca abierto. **Método:** Elephant (coordinador) + 3 subagentes Goldfish de contexto fresco cubriendo 6 frentes (1 Arquitectura/API · 2 Seguridad/Auth/RLS · 3 IA/proveedores/modos · 4 UX/diseño/a11y · 5 Datos/Supabase · 6 Testing/CI/obs/perf/Docker/extensión) + verificación propia del coordinador de los P1 principales (F1-01/F3-02 confirmado en código: el cliente envía `provider` y lee cabeceras `x-promptperfect-*` que la ruta nunca emite). Sustitución de método declarada: plugin EGM no adoptado in-repo; línea ejecutada con subagentes frescos.

## Línea base ejecutada (Fase 0, Mac, Node v24.22.1)
| Gate | Resultado |
|---|---|
| `npm run test:run` | ✅ 511/511 tests, 85/85 ficheros (132,59 s) — suelo de no-regresión |
| `npm run typecheck` | ❌ 1 error TS2345 `src/app/api/feedback/route.ts:123` (`user_id: string\|undefined`) |
| `npm run lint` | ❌ 12 errores, todos `react-hooks/set-state-in-effect` |
| `npm run build` | ❌ Falla en el mismo TS2345 — **la rama no compila en producción** |
| `npm run test:coverage:critical` | ✅ 62 tests; 98,3 % stmts / 90,38 % branch (solo 4 ficheros en el gate) |
| `npm run perf:budget` | ✅ sobre `.next` preexistente: 28 ficheros JS, máx 140 KB gz, total 489 KB gz (presupuesto 200/550) |
| `npm run test:e2e` | ⛔ No ejecutable en baseline: requiere build, y el build está roto por TS2345 |
| Docker build | ⛔ Daemon Docker no activo en el Mac (cliente 29.9.1 presente) — declarado, no fingido |
| `db:verify` / migraciones | ⛔ Sin DATABASE_URL local disponible; verificación de BD = CI `db.yml` efímero |

Inventario de superficies (desde código): 17 directorios de rutas API + `src/proxy.ts` (Next 16, refresh Supabase con `getUser()`), páginas app/auth/library/profile/control-room/docs/share, ~60 componentes, 8 hooks, lib client/server/auth, 25 migraciones Supabase, extensión MV3, 3 specs e2e (166 líneas), 2 workflows CI, Dockerfile multi-stage.

## Inventario maestro de hallazgos (disposición explícita por ítem)

Clave: **CORREGIR** = se implementa en este programa · **DOC** = corrección documental factual · **DIFERIDO** = diseño registrado, implementación fuera por riesgo/alcance, con motivo · **PENDIENTE** = «pendiente de decisión» de Carlos · **DESCARTAR** = no se hace, con motivo.

### Baseline
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| B-01 | P1 | Typecheck TS2345 en feedback:123 (unión con `user_id?: undefined` al insert legacy) | CORREGIR (E1) — patrón spread condicional ya usado en el mismo fichero |
| B-02 | P2 | Lint: 12× `set-state-in-effect` en 8 ficheros | CORREGIR (E4) por patrón real, sin disables en bloque |
| B-03 | P1 | Build de producción roto (consecuencia de B-01) | CORREGIR vía B-01; build es el gate de cierre |
| B-04 | — | Untracked `pnpm-lock.yaml` + `pnpm-workspace.yaml` en un repo npm canónico | PENDIENTE — no adoptar, no borrar, no commitear (decisión de Carlos) |

### Frente 1 — Arquitectura/API/validación
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F1-01 | P1 | `/api/optimize` descarta `provider`/`version` del parser, hardcodea Gemini y nunca emite las cabeceras `x-promptperfect-provider/model` que el cliente lee → la UI **muestra el proveedor elegido y ejecuta otro** (falso éxito verificado) | CORREGIR (E1) |
| F1-02 | P2 | ADR-0002 violado: validación inline divergente en history/saved-prompts; 3 copias de la lista de modos; history POST y save-history duplican operación con auth distinta | DIFERIDO — unificación diseñada en E1; riesgo alto de regresión sin ganancia inmediata; queda registrado |
| F1-03 | P2 | Parsers sin topes espejo de los CHECK de BD (`explanation` ≤20 000, `session_id` ≤300) y sin `normalizeModeForDb` en history/save-history → modos no-DB reventan CHECK = 500 en vez de funcionar/400 | CORREGIR (E1) en `parseSaveHistoryBody` + rutas |
| F1-04 | P2 | `getServiceClient()` degrada en silencio a cliente anon si falta la service key (llamantes asumen bypass RLS) | CORREGIR (E1) — devolver `null` como `getSupabaseAdminClient`; llamantes dan error explícito |
| F1-05 | P3 | Envelopes/códigos inconsistentes (429 artesanales, `{ok}` vs `{success}`, feedback 500 en vez de 503, `hint` con instrucciones internas) | CORREGIR parcial (feedback 503, E1); resto DIFERIDO |
| F1-06 | P3 | Sin límite de tamaño de cuerpo antes de `req.json()` | DIFERIDO — wrapper compartido diseñado en E1 |
| F1-07 | P3 | `proxy.ts` intercepta OPTIONS de todo `/api/*` reflejando cualquier Origin; el OPTIONS con allowlist de optimize-sync es código muerto | PENDIENTE — tocar CORS de la extensión sin e2e de extensión es riesgo; registrado en E1/E7 |
| F1-08 | P3 | profile GET sin rate-limit, con escritura al leer y sin `.limit()`; stats duplica lógica sin cota | DIFERIDO (E1) |
| F1-09 | P3 | Deriva menor ADR-0001: doble `getSupabaseUrl`, import vía re-export de localMode | DIFERIDO — limpieza sin urgencia |

### Frente 2 — Seguridad/Auth/RLS/rate-limit
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F2-01 | P1 | `/api/optimize` quema clave del servidor sin autenticación ni cuota guest server-side (solo rate-limit/IP) — idéntico a F3-02 | PENDIENTE — cerrar la ruta rompe el free-tier guest actual; formalizarla exige cuota server-side. Decisión de producto/coste de Carlos (E2) |
| F2-02 | P1 | Políticas RLS «guarded» de 20261012 (`opt_logs_guest_insert_guarded`, `pp_history_guest_insert_guarded`) **sin condición `user_id IS NULL`** anulan por semántica OR el fix anti-spoof de 20261018: anon puede insertar con `user_id` ajeno y pre-fijar `share_id` en historial | CORREGIR (E2) — migración nueva 20261112 (no aplicada: su aplicación es PENDIENTE) + probes anon en verify.js para history |
| F2-03 | P2 | feedback: escritura service-role sobre filas ajenas por `session_id`; `feedback` sin enum (texto libre ≤2 000) | CORREGIR parcial (enum `up\|down` en parser, E2); ownership del session_id PENDIENTE (diseño en E2) |
| F2-04 | P1/P2 | Rate-limit en memoria por proceso + clave `x-forwarded-for` falsificable (crítico en self-hosted Docker) | PENDIENTE — limitador distribuido = decisión de infraestructura (E2) |
| F2-05 | P1 cond. | forgot-password: `recoveryLink` devuelto si el redirect «parece local», y el origen se construye desde cabeceras del cliente (`x-forwarded-host`) → posible toma de cuenta en despliegues sin proxy saneador | CORREGIR (E2) — enlace solo si `NODE_ENV !== 'production'` Y destino loopback |
| F2-06 | P2 | forgot-password: el 503 vuelve a exponer instrucciones con la variable de configuración; `googleOnlyHint` rompe el anti-enumeración | CORREGIR (E2) — 503 genérico; hint fuera de la respuesta pública |
| F2-07 | P2 | guest-usage: cuota eludible (guestId acuñado por el cliente) + race no atómica (= F5-09) | CORREGIR vía E5 (RPC atómica); la elusión por re-acuñación se documenta como fricción, no control (DOC en ADR-0006) |
| F2-08 | P2 | BYOK en claro en `pp_users.api_key`, sin ningún lector en `src/` (riesgo sin beneficio) + `password_hash` legacy (= F3-01) | PENDIENTE — cifrar o dejar de persistir = decisión de Carlos (E2/E3) |
| F2-09 | P2 | local-scan: `isPathAllowed` léxico sin `realpath` (la raíz symlink escapa la allowlist, contra ADR-0009); walk genérico no deniega `*.pem`/`id_rsa`/`credentials*.json`; `redactSecrets` solo en AI-configs | CORREGIR (E2) — realpath de la raíz + denylist de nombres de secreto en el walk |
| F2-10 | P3 | CSP con `unsafe-inline` permanente en script-src; `img-src https:` amplio | INTEGRAR como deuda declarada con este registro; nonce = programa propio (PP-26) |
| F2-11 | P3 | SECURITY_AUDIT.md (2026-05-16) dado por vigente: cubre 9 de 22 rutas y afirma cosas ya falsas (rate-limit en DELETE de history, claim a 10/min vs 20 real) | DOC (E2) — addendum de caducidad y cobertura real, sin reescribir los veredictos originales |
| F2-12 | P3 | Share sin revocación ni caducidad; `Authorization: Bearer` con doble significado (JWT vs clave de proveedor) | PENDIENTE — revocación = decisión de producto (E5); separación de header DIFERIDO |

### Frente 3 — IA/proveedores/modos
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F3-01 | P1 | BYOK persistida en claro en DOS sitios contra el contrato de `types.ts` («Never persisted server-side»): `pp_users.api_key` + `localStorage`; el logout no borra ninguna | PENDIENTE (persistencia server, = F2-08); CORREGIR parcial: logout borra la clave local + comentario de `types.ts` veraz (E3) |
| F3-02 | P1 | = F2-01 | PENDIENTE |
| F3-03 | P2 | Fallos mid-stream invisibles: `streamText` sin `onError`; health nunca degrada por la ruta principal | CORREGIR (E1) — `onError` → `recordProviderFailure()` + log saneado |
| F3-04 | P2 | Sin timeout de proveedor en optimize/optimize-sync/translate (solo `maxDuration` de plataforma) | CORREGIR (E1) — `AbortSignal.timeout(45_000)` + mapeo de error |
| F3-05 | P2 | `userFacingOptimizeError` ciego al proveedor: todo error «parece de Gemini» (instrucciones de Google y de `.env` a usuarios BYOK de Anthropic/OpenAI) | CORREGIR (E1) — parámetro `provider`, copy por proveedor |
| F3-06 | P2 | Higiene de errores: optimize loguea `err.message` sin sanitizar; el catch de sync no loguea nada; el sanitizador no cubre `sk-ant-…`/`x-api-key`/`"api_key":` | CORREGIR (E1) — sanitizador ampliado en ambos extremos |
| F3-07 | P2 | Modos desiguales: `SPECIFIC` y 5 modos = una frase frente a BETTER estructurado; `SHORTER/LONGER` fantasma fuera del tipo; sin evals por modo | DIFERIDO — elevar modos sin golden set (PP-03) sería opinión; diseño en E3 |
| F3-08 | P2 | Modo `production` ofrecido en el selector general aunque presupone un digest de directorio → incentiva alucinar ficheros | CORREGIR menor (E3) — descripción/etiqueta «requiere vincular un proyecto» en el selector |
| F3-09 | P2 | Modelo mostrado ≠ modelo ejecutado: etiquetas «Gemini 2.0 Flash / GPT-4o-mini» vs reales (`gemini-3.5-flash`/`gpt-6-astra`/`claude-3-5-haiku-latest`); literales divergentes en 6+ ficheros; la preferencia de modelo persistida es decorativa | CORREGIR (E3) — catálogo único `src/lib/modelCatalog.ts` consumido por UI y providers |
| F3-10 | P2 | Dos scores incompatibles: el de BD está muerto por diseño (el prompt prohíbe `---SCORE---` y el delimiter lo elimina, pero ambas rutas lo parsean para `prompt_score`) y el visible es heurística local | CORREGIR (E3) — se retira la vía muerta de BD; la heurística queda documentada como tal |
| F3-11 | P2 | Heurísticas anglocéntricas (ES suspende checks), coste solo para un modelo con estimaciones de terceros, remediation se anexa sin deduplicar en cada clic | CORREGIR parcial (dedupe de remediation, E3); léxico ES y coste real DIFERIDO |
| F3-12 | P2 | Sin validación del contrato de salida: respuesta sin delimitadores = éxito 200 silencioso; solo OpenAI tiene `maxOutputTokens` | CORREGIR parcial (topes para todos vía `getProviderCallOptions`, E1/E3); aviso de incompleto DIFERIDO |
| F3-13 | P3 | verify-key quema una completion real con un modelo ≠ runtime (falsos «unreachable» sin créditos) | DIFERIDO (E3) — endpoints de metadatos por proveedor |

### Frente 4 — UX/diseño/a11y
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F4-01 | P2 | = B-02, con análisis por sitio: el peor caso (AppSettingsPanel) **borra la clave que el usuario teclea** si el padre cambia `apiKey` con el panel abierto | CORREGIR (E4) |
| F4-02 | P2 | Dos diálogos artesanales (settings, delete-confirm) se saltan la primitiva `Modal` y su accesibilidad (sin Escape/foco/scroll-lock; drawer 360px fijo) | DIFERIDO — migración visual sin e2e autenticado = riesgo; diseño en E4. Se corrige la primitiva (F4-03) que es el prerrequisito |
| F4-03 | P2 | Ni `ui/Modal` atrapa el foco: Tab escapa al fondo con `aria-modal="true"` | CORREGIR (E4) — focus-trap en la primitiva, un solo sitio |
| F4-04 | P2 | ADR-0008 burlado: hex/zinc arbitrarios en componentes (~95 grises), residuos de modo claro pese a dark-only | DIFERIDO — codemod de tokens = programa propio; registrado |
| F4-05 | P3 | Contraste sub-AA documentado sin cerrar en ADR-0008; emojis 🟢⬛🟣 como iconos contra el sistema Lucide | CORREGIR parcial (emojis → puntos tokenizados, E4); contraste PENDIENTE (design-owned, sign-off de Carlos) |
| F4-06 | P2 | Axe e2e solo sobre superficies vacías/no autenticadas; los estados de riesgo (settings, delete, resultado, error) no están cubiertos | DOC (alcance real en README, E6) + DIFERIDO escenarios autenticados |
| F4-07 | P2 | Error principal de optimización en `/app` sin `role="alert"` ni reintento (inconsistente con otros componentes del repo) | CORREGIR (E4) |
| F4-08 | P3 | Plantillas: son **75**, no 60 (README); navegación = muro de 76 píldoras sin búsqueda por texto | CORREGIR (DOC cifra + búsqueda por texto en TemplatesTab, E4) |
| F4-09 | P3 | Carga de HistoryPanel en texto plano sin `Skeleton`; historial inaccesible en móvil (`hidden md:block` sin alternativa) | DIFERIDO (E4) — Skeleton sí se adopta si el cambio es trivial; móvil = decisión de diseño |
| F4-10 | P3 | Streaming sin anuncio de finalización para lectores de pantalla | CORREGIR (E4) — `aria-live` de resumen al completar |

### Frente 5 — Datos/Supabase
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F5-01 | P2 | Deriva numérica: 25 migraciones reales; ADR-0004 dice 22; cifras publicadas inconsistentes | DOC (E5) — addendum en ADR-0004, sin reescribir el ADR |
| F5-02 | P2 | «47 assertions» de db:verify es falso y no determinista (máx. dinámico ~55, ramas condicionales con skip silencioso) | DOC (E5) — fuera la cifra de ambos README; la suite ya imprime su conteo real |
| F5-03 | P1 | `migrate.js`: migración vacía/`-- empty` nunca se registra → queda «pending» eterna y `db:check` (gate pre-deploy) sale 1 para siempre | CORREGIR (E5) — registrar también en la rama skip |
| F5-04 | P2 | `migrate.js` sin checksum: editar una migración aplicada es invisible (contra ADR-0004) | DIFERIDO — sin BD local para verificar el cambio de tracking; diseño en E5 |
| F5-05 | P2 | TLS degradado: `rejectUnauthorized:false` para todo host no-localhost en migrate.js y verify.js (DDL privilegiada aceptando MITM) | CORREGIR (E5) — `true` por defecto; escape `PGSSL_INSECURE=1` solo local explícito |
| F5-06 | P1 | `guest_usage` duplicado no converge: la forma uuid-PK de 20260401 **jamás ha existido** en ninguna BD (la texto-PK de 20250404 gana por orden y las demás son no-op); ADR-0006 afirma lo contrario | PENDIENTE (convergencia de esquema = decisión) + DOC addendum veraz en ADR-0006 (E5) |
| F5-07 | P2 | Políticas históricas sin `DROP IF EXISTS` (contra la regla escrita del repo): replay sin tracking muere a mitad | DOC (nota de limitación en supabase/README, E5); no se reescriben migraciones aplicadas |
| F5-08 | P3 | Legacy deprecado bien señalizado, pero SETUP_SHARE_FEATURE.sql conserva en claro el host de un proyecto Supabase real; el guard de db.yml no tiene dientes (= F6-05) | CORREGIR (host redactado, E5) + guard con `exit 1` (E6) |
| F5-09 | P1 | Cuota guest con race read-then-upsert: el límite es sorteable en concurrencia (= F2-07) | CORREGIR (E5) — RPC atómica en migración nueva (no aplicada) + ruta rpc-first con fallback legado |
| F5-10 | P1 | Claim: ADR-0006 promete ruta `guest-migrate` (inexistente) y backfill de perfil (inexistente); la ruta devuelve `{ok:true, skipped:true}` 200 sin admin = **éxito fingido** | CORREGIR parcial (503 honesto + test, E5); backfill PENDIENTE (semántica de conteo); DOC addendum ADR-0006 |
| F5-11 | P2 | Cliente de claim: vía 3 anon directa sin la guarda `user_id IS NULL` del servidor (muerta por RLS hoy, peligrosa si una política la reabre) y borra el storage local aunque el claim servidor falle | CORREGIR (E5) — vía 3 eliminada; limpieza solo tras claim confirmado |
| F5-12 | P2 | Share sin revocación/caducidad ni assertions en verify.js (= F2-12) | PENDIENTE (producto) |
| F5-13 | P3 | verify.js §7: el trigger signup→perfil puede no probarse y salir verde | DIFERIDO — flag `VERIFY_STRICT` diseñado en E5 |

### Frente 6 — Testing/CI/observabilidad/perf/Docker/extensión
| ID | Sev | Hallazgo | Disposición |
|---|---|---|---|
| F6-01 | P2 | Coverage principal sin thresholds (no puede fallar); el gate crítico cubre solo 4 ficheros | CORREGIR parcial (ampliar critical a `guest.ts` si la cobertura lo sostiene, E6) + DOC del alcance |
| F6-02 | P1 | `perf:budget` declarado y **sin cablear en ningún workflow** | CORREGIR (E6) — paso en el job build de ci.yml |
| F6-03 | P2 | CI: e2e duplica el build pese a `needs: build`; triggers solo sobre main (la rama de hardening no dispara CI) | CORREGIR parcial (trigger incluye la rama, E6); doble build DIFERIDO |
| F6-04 | P3 | E2E = 3 specs/166 líneas, cero flujo autenticado ni optimización real | DOC (alcance honesto en README, E6) |
| F6-05 | P2 | db.yml: el schema-diff guard solo hace `echo` — nunca falla (= F5-08) | CORREGIR (E6) — `exit 1` |
| F6-06 | P1 | Dockerfile se vende como «standalone server» y no hay standalone en ningún sitio; runner con `npm ci` completo + parche manual de TypeScript; sin `USER` (root) | DOC (comentario veraz, E6); standalone+non-root PENDIENTE (sin daemon Docker no se puede verificar la imagen) |
| F6-07 | P3 | Healthcheck divergente: imagen → `/api/healthz`, compose → `/` | CORREGIR (E6) — compose a `/api/healthz` |
| F6-08 | P2 | healthz siempre `ok` (db = hint de configuración, no query viva — honesto en su comentario, engañoso como «readiness»); providerHealth = memoria de proceso; logger de adopción parcial | DIFERIDO (live-check diseñado en E6); se corrige F3-03 que es su causa principal en la ruta reina |
| F6-09 | P1 | Extensión: **la API key BYOK se guarda en `chrome.storage.sync`** (se replica en claro a los servidores de Google y a todos los Chrome del usuario); cero tests/CI de la extensión; default de producción personal hardcodeado en 3 sitios | CORREGIR (E7) — clave a `storage.local` (con lectura legacy de migración), prefs no sensibles quedan en sync; default al dominio canónico del proyecto |
| F6-10 | P3 | n8n: credencial como campo Set del workflow exportable; test del ejemplo huérfano (nadie lo ejecuta) | DOC (guía de credenciales en examples/README, E7) |
| F6-11 | P3 | Tabla de deriva declarado-vs-real (47 assertions, guest-migrate, convergencia, perf:budget, standalone, readiness, n8n) | Cubierta ítem a ítem en F5/F6 |

## Positivos verificados que no deben romperse
proxy.ts con `getUser()` (no `getSession()` para autorizar) · ADR-0001 sin violaciones cliente→servidor · RLS `*_own` coherente tras 20261018 en saved_prompts/profiles · claim servidor solo adopta filas `user_id IS NULL` · login con error genérico anti-enumeración · verify-key exige sesión · headers base completos · runner de migraciones transaccional con `--dry-run/--check` · db.yml efímero completo · critical coverage `perFile` anti-enmascaramiento · extensión MV3 con permisos mínimos · legacy con headers DEPRECATED · templates: la UI sí muestra el conteo dinámico correcto (75).
