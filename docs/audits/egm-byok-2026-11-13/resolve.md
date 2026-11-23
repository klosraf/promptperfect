# Resolve EGM — Remediación BYOK (F2-08/F3-01) · 2026-11-13

## Registro de despacho Goldfish (contexto fresco, solo lectura, solo brief+draft)

| Persona | Modo | Agente | Veredicto |
|---|---|---|---|
| design_critic | REVIEW | af9edaf4 | NO APTO (condiciones) |
| implementation_readiness | REVIEW | f5001f15 | APTO CON CAMBIOS |
| comprehension | REVIEW | eeaff502 | APTO CON CAMBIOS |

Contexto inyectado por el harness en los subagentes: ficheros permanentes del
parque (declarado según la skill; no es historial de esta conversación).

## Evidencia adicional levantada por el Elephant tras la review

1. **Cero lectores, artefacto exhaustivo (2026-11-13):** grep de `api_key`/
   `pp_users` en `src`, `extension`, `examples`, `supabase/**/*.sql|js`:
   ningún `select('*')` sobre `pp_users`; el trigger
   `pp_on_pp_users_profile` (20260402100000:85) copia solo id/email/nombre a
   `pp_user_profiles`; `20261012000000` toca `pp_users` solo para RLS y la
   constraint de demo tokens; `monitoring.sql` solo enumera nombres de tabla;
   ningún objeto de BD, vista, función o RPC lee `api_key`. Superficies fuera
   del repo (scripts/cron de terceros) no existen en el árbol ni en la
   topología conocida; un acceso directo PostgREST con service-role es un
   compromiso ya cubierto por el modelo de amenaza (volcado de BD).
2. **Logs en tránsito:** las rutas que reciben la clave (optimize,
   optimize-sync, translate, update-user) solo registran mensajes saneados
   (`sanitizeProviderMessage`, `optimizeUserError` redacta patrones de clave)
   y códigos de estado; ningún logger captura body ni header Authorization.
3. **DDL de la columna:** `supabase/migrations/20250311000001_pp_users.sql:8`
   — `api_key text default ''`, **nullable**, sin NOT NULL; ninguna migración
   posterior la altera.
4. `parseUpdateUserBody` tiene exactamente **un** consumidor:
   `src/app/api/auth/update-user/route.ts:28`.

## Adjudicación (PROPOSE FIX = aceptado / CONTEST / ESCALATE)

| # | Hallazgo (origen) | Adjudicación |
|---|---|---|
| B-DC-1 | Premisa cero lectores sin artefacto exhaustivo (design_critic, Blocker) | PROPOSE FIX — artefacto levantado (evidencia 1); queda asentado en brief/informe |
| B-DC-2 | Asiento sin identidades → notificación imposible; backups sin expiración (design_critic Blocker; impl-readiness 10; comprehension 2) | PROPOSE FIX — paso previo a la migración en el runbook: exportar ids/emails de afectados (nunca claves) a un canal seguro fuera de la BD, notificar con plazo de rotación de 30 días, destruir la lista tras notificar. La fecha de expiración del último backup pre-nulificación NO es acreditable desde este entorno → queda como puerta del día de ejecución + desviación del estándar a firmar por Carlos (ESCALATE en el informe, no bloquea la preparación) |
| B-DC-3 | CHECK acoplada a la nulificación; trampa de rollback (design_critic Blocker; impl-readiness 8,9) | PROPOSE FIX — dos migraciones separadas con ventana de observación (ver draft enmendado); nulificación transaccional con LOCK y predicado único; interlock = congelación de despliegues declarada en runbook + secuencia de rollback probada en efímero |
| B-IR-1 | La migración era prosa, sin SQL literal (impl-readiness, Blocker) | PROPOSE FIX — SQL literal completo incorporado al draft enmendado |
| B-IR-2 | Idempotencia: asiento duplicable y ADD CONSTRAINT no re-ejecutable (Blocker) | PROPOSE FIX — asiento con `WHERE NOT EXISTS` por check_name; guarda en `DO` con `IF NOT EXISTS` en pg_constraint; prueba de doble ejecución en efímero |
| B-IR-3 | Nulabilidad no citada (Blocker) | PROPOSE FIX — citada (evidencia 3: nullable, DEFAULT '') |
| M-DC-logs | Logs con la clave en tránsito no auditados; shim sin fecha de extinción (Major) | PROPOSE FIX parcial — auditoría asentada (evidencia 2); extinción del shim: se retira del parser en la release siguiente a que la guarda esté aplicada y ambos clientes lleven una release sin enviarlo (condición nombrada en ADR-0010); sin telemetría nueva (no se loguea presencia de clave: sería un canal nuevo sobre secretos) |
| M-IR-4/DC-seat | Tabla de asiento sin RLS (Major ×2) | PROPOSE FIX — RLS activada y forzada, sin políticas, REVOKE a anon/authenticated en el SQL literal |
| M-IR-5 | Lista de tests/fixtures no enumerada (Major) | PROPOSE FIX — lista por grep en el draft enmendado; suelo 543/88 se preserva reescribiendo, no borrando |
| M-IR-6 | Decisiones dejadas al implementador: semántica del parser, textos exactos (Major) | PROPOSE FIX — parser: `api_key` ausente (no `undefined`) de `value`; error 400 byte-idéntico para no-string o >2000; textos de comentarios y contenido del ADR fijados en la implementación según la especificación del draft enmendado |
| M-IR-7 | Batería efímera insuficiente (Major) | PROPOSE FIX — aserciones (a)–(f) adoptadas íntegras en la verificación |
| M-C-3 | «El único cambio visible es ninguno» es falso (comprehension, Major) | PROPOSE FIX — párrafo de cohortes (a)/(b)/(c) en draft e informe; brief corregido |
| M-C-4/5 | Filas de amenaza sin cualificar; «reversibilidad» engañosa (Major) | PROPOSE FIX — filas cualificadas «tabla viva post-migración»; rotación = único remedio de copias históricas; «irreversible en datos, reversible en esquema» |
| M-C-6/DC-caducidad | Ventana de observación y legacy sin dueño ni caducidad (Major/Nit) | PROPOSE FIX — ventana: 14 días o una release completa (la mayor), dueño = operador del despliegue; salida: conteo de escrituras nuevas = 0 → aplicar guarda; tipo legacy y shim salen en la release posterior a la guarda |
| M-C-7 | Gemini sin explicar (Major) | PROPOSE FIX — Gemini usa la clave de servidor del producto; nunca hubo clave de usuario persistida para gemini (clientes envían '' y loadApiKey devuelve '') |
| N-varios | Glosario, referencias §5, desviación «doble lectura» de la skill (Nits) | PROPOSE FIX — waiver explícito: la doble lectura que exige el patrón (d) es N/A con evidencia de cero lectores (no hay lectura que duplicar); la ventana equivalente es código-primero/datos-después. Glosario y referencias corregidos en el informe |
| N-DC-B | Rechazo de B apoyado en disponibilidad no comprobable | PROPOSE FIX — rechazo reescrito: B/C se rechazan porque no existe consumidor que justifique custodia alguna; la disponibilidad de Vault ni se afirma ni se necesita |

**Veredicto consolidado tras resolve: APTO CON CAMBIOS APLICADOS** — la opción
A se implementa en código y las dos migraciones quedan preparadas y probadas
en efímero. Las condiciones que miran al día de ejecución en producción
(notificación previa, expiración de backups, propagación del despliegue,
firma de la desviación sobre backups) quedan como puertas escritas en el
runbook del informe; no son ejecutables desde este entorno y no bloquean la
preparación autorizada.
