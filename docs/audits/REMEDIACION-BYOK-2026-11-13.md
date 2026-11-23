# Remediación BYOK en servidor (F2-08/F3-01) — preparación completa

- **Fecha:** 2026-11-13 · **Árbol:** `~/Proyecto/promptperfect`, HEAD `e6a5d4a`
  — sin commit, sin push, sin merge.
- **Autorización:** Carlos, 2026-11-13 («Procede con todo»). La BD real no es
  alcanzable desde este entorno (el `.env.local` del Mac es la plantilla;
  verificado por el padre): este expediente es **diseño + código + migración
  de datos preparada y probada solo en Postgres efímero**. Nada se ejecutó
  contra ninguna BD real.
- **Expediente origen:** `docs/audits/ENDURECIMIENTO-SAAS-2026-11-13.md` fila
  (d2) = «BLOQUEADO POR DECISIÓN SOBERANA» → desbloqueada por la autorización.
- **Línea EGM:** `docs/audits/egm-byok-2026-11-13/` (brief, draft, resolve).
  Despacho Goldfish: design_critic (NO APTO con condiciones), 
  implementation_readiness (APTO CON CAMBIOS), comprehension (APTO CON
  CAMBIOS) → resolve con adjudicación completa → **APTO CON CAMBIOS
  APLICADOS**. Goldfish fresco del diff final: ver §7.

## 1. Mapa real del flujo BYOK (verificado 2026-11-13, fichero:línea)

**Único escritor de un valor no vacío:**
- `src/app/api/auth/update-user/route.ts:49` —
  `updates.api_key = apiKey`, alimentado por `parseUpdateUserBody`
  (`src/lib/apiSchemas.ts:265-271`, un solo consumidor: la propia ruta, :28).

**Clientes que enviaban la clave a esa ruta:**
- `src/components/AppSettingsPanel.tsx:99` y `src/app/control-room/page.tsx:110`.

**Escritores de `''` (altas, sin secreto):** `signup/route.ts:172`,
`src/lib/auth/jsonLoginSuccess.ts:41`, `src/app/api/save-history/route.ts:72`.

**Lectores de `pp_users.api_key`: NINGUNO** (artefacto exhaustivo: grep en
`src`, `extension`, `examples`, `supabase/**/*.sql|js`; ningún `select('*')`
sobre `pp_users`; `profile/route.ts` selecciona columnas explícitas sin la
clave; el trigger `pp_on_pp_users_profile` copia solo id/email/nombre;
ninguna ruta de optimización consulta `pp_users` — usan la clave de la
petición, Bearer o body, o la clave de servidor; ningún objeto de BD lee la
columna). Vestigio: `control-room/page.tsx:26,57` tipaba `api_key` y lo
fijaba a `undefined`.

**Custodia en cliente (la única funcional):** `loadApiKey`
(`src/lib/client/enginePrefsStorage.ts:69-83`) lee
`localStorage['promptperfect:apikey']` por proveedor;
`useWorkspaceSession.ts:69,79,115` la consume; el logout la borra
(`clearStoredApiKeys`). Gemini usa la clave de servidor del producto: nunca
hubo clave gemini de usuario persistida.

**Conclusión:** persistencia sin consumidor, en contradicción con el README
(:20): «Your API keys are stored locally in your browser and never saved to
our servers».

## 2. Diseño (resumen; detalle en egm-byok-2026-11-13/)

Comparadas con modelo de amenaza explícito: **(A) dejar de persistir en
servidor** — derrota el volcado de BD y el volcado BD+host por inexistencia
del dato; **(B) Supabase Vault** y **(C) envolvente con KEK en env** se
rechazan porque no existe consumidor que justifique custodia alguna a ningún
nivel de cifrado (y C además comparte frontera KEK↔host). **Elegida: A.**
ADR: `docs/adr/0010-byok-client-only.md`. Waiver registrado: la «doble
lectura» del patrón (d) es N/A con cero lectores acreditados; la ventana
equivalente es de despliegue (código primero, datos después).

## 3. Implementado en el árbol (código)

1. `src/lib/apiSchemas.ts` — `parseUpdateUserBody` valida `api_key` con el
   mismo contrato 400 (tipo/cota 2000) y lo **descarta**: `value` ya no
   contiene la propiedad (`UpdateUserBodyValue` sin `apiKey`).
2. `src/app/api/auth/update-user/route.ts` — nunca escribe `api_key`;
   comentario de frontera reescrito (ADR-0010).
3. `AppSettingsPanel.tsx` y `control-room/page.tsx` — dejan de enviar
   `api_key` en el body (siguen guardando en localStorage y confirmando
   provider/model; UX sin cambios); control-room pierde el campo vestigio.
4. Altas (signup, jsonLoginSuccess, save-history) — dejan de escribir
   `api_key: ''` (la columna conserva `DEFAULT ''`, nullable según
   `20250311000001_pp_users.sql:8`).
5. `src/lib/types.ts:23` y `src/types/database.ts` — comentarios corregidos;
   el tipo de la columna queda marcado legacy con caducidad (tras la guarda).
6. Tests reescritos (no borrados): ruta update-user (la clave nunca llega al
   `update`; el guardado con `api_key` presente responde 200), parser
   (propiedad ausente, 400 intacto), panel (body sin `api_key`, clave solo
   local) — +1 test nuevo, suelo superado.

**Impacto por cohortes:** (a) mismo navegador — nada cambia; (b) navegador
nuevo — la clave se vuelve a pegar (la promesa ya publicada); (c) copia local
perdida + stock nulificado — la clave se reemite en el proveedor. La
nulificación es **irreversible en datos, reversible en esquema**.

## 4. Migración de datos preparada (NO ejecutada contra ninguna BD real)

- `supabase/migrations/20261113000000_nullify_pp_users_api_key.sql` — asiento
  de conteo sin valores (tabla `pp_users_api_key_remediation`, RLS forzada
  sin políticas, revokes condicionales a los roles de Supabase) y
  nulificación en **una sola sentencia** CTE (el conteo es exactamente el de
  las filas nulificadas). Idempotente.
- `supabase/prepared/20261113000001_pp_users_api_key_guard.sql` — guarda
  CHECK `pp_users_api_key_must_be_empty`, idempotente. Vive **fuera** de
  `supabase/migrations/` para que ninguna corrida de cadena la aplique por
  accidente, y su bloque `DO` **se niega mecánicamente** a ejecutarse si el
  asiento del paso 1 tiene menos de 14 días. El día de la ejecución se mueve
  a `supabase/migrations/` y se aplica. La columna no se elimina (DROP =
  paso soberano posterior).

**Verificación en efímero (Postgres 17 local, datos sintéticos):**
- Batería dirigida: **24/24 aserciones** — stock mixto (clave, `''`, NULL,
  solo-espacios) nulificado con asiento = 2; doble ejecución sin duplicar
  asiento; re-ejecución con stock nuevo lo nulifica y lo asienta por
  separado; la salida no contiene la clave sintética; `anon` no lee el
  asiento; la guarda **se niega dentro de la ventana** y, con el asiento
  envejecido, rechaza INSERT y UPDATE con clave y permite `''`/NULL;
  columna y `DEFAULT ''` intactos; BD con stock cero → asiento 0.
- Cadena completa con el runner real: **28/28 migraciones aplicadas** en
  efímero (con stub mínimo de `auth`), `--check` = 0 pendientes; la de
  nulificación registrada y la guarda correctamente ausente de la cadena.
- La batería cazó y se corrigieron tres defectos reales del SQL antes de
  cerrar (revokes sin roles presentes; `LOCK TABLE` incompatible con el
  runner; asiento que no registraba re-nulificaciones).

## 5. Runbook para el día que exista acceso a la BD real (orden exacto)

Puertas previas: DATABASE_URL real dejada por Carlos en el Mac (él la
introduce; nunca por chat) y despliegue del código de este expediente
verificado en producción (la app sirve la build sin el escritor).

1. **Identificar el proyecto real** (`db:check` responde; conteos previos:
   filas totales y no-vacías con el predicado invariante
   `api_key IS NOT NULL AND api_key <> ''`). Solo conteos: **ninguna consulta
   puede devolver valores de clave**.
2. **Lista de notificación:** exportar id/email de las filas con clave
   (nunca la clave) a un canal seguro fuera de la BD.
3. **Backup verificado** (procedimiento del informe de aplicación del
   padre) y registrar su fecha: es el último backup que puede contener
   claves en claro; acceso restringido hasta que expire su retención.
4. **Aplicar `20261113000000`** (nulificación). Verificación post: conteo de
   no-vacías = 0; asiento presente con el conteo previo; sonda de escritura
   en transacción revertida.
5. **Notificar a los afectados** (paso 2) con plazo de rotación de 30 días
   en su proveedor; destruir la lista al completar la notificación.
6. **Ventana de observación:** 14 días o una release completa (la mayor),
   dueño = operador del despliegue; conteo de escrituras nuevas = 0.
7. **Aplicar la guarda:** mover
   `supabase/prepared/20261113000001_pp_users_api_key_guard.sql` a
   `supabase/migrations/` y aplicar. Su interbloqueo interno exige que el
   asiento del paso 4 tenga ≥14 días; si se niega, la ventana no ha cerrado.
   Verificación post: constraint validada; sonda UPDATE con clave rechazada
   en transacción revertida; guardado de ajustes real (sin clave) en 200.
8. **Rollback (único procedimiento válido):** antes de la guarda, revertir
   código es seguro (se reanuda la persistencia; la migración se re-prepara
   y el stock se re-cuenta). Tras la guarda: primero
   `DROP CONSTRAINT IF EXISTS pp_users_api_key_must_be_empty`, después
   rollback de código, y al re-desplegar la corrección, re-nulificar
   (fichero 1 es re-ejecutable; el asiento conserva el conteo original, la
   re-nulificación se asienta como ejecución nueva en el runbook).
   La nulificación en sí es irreversible: ningún rollback restaura claves.
9. **NUNCA:** aplicar la migración de datos antes de verificar el despliegue
   del código; restaurar un backup pre-nulificación sin re-ejecutar los
   pasos 4 y 7; eliminar la columna en esta fase; retirar la guarda fuera
   del paso 8.

**Desviación del estándar a firmar por Carlos el día de la ejecución:** la
«prueba de ausencia del secreto en backups/réplicas previos» del patrón (d)
no es acreditable desde ningún entorno disponible; se sustituye por la
rotación notificada (paso 5) y la expiración de retención del paso 3. Hasta
que la ventana de rotación cierre, el stock histórico se clasifica como
**exposición residual abierta**, no cerrada.

## 6. Rotación y pérdida/compromiso (opción A, vigente desde el diseño)

- En servidor no hay KEK ni stock que rotar tras la migración.
- Compromiso del cliente: revocar en el proveedor y sustituir en Ajustes
  (solo local). El logout borra las claves locales; cerrar el navegador, no.
- Pérdida: sin custodia que perder; la clave se reemite en el proveedor.
- Riesgo aceptado y registrado en ADR-0010: `localStorage` es legible por
  cualquier XSS del origen; mitigaciones = CSP de la app y borrado al
  logout.

## 7. Gates y Goldfish final

- typecheck: limpio · lint `--max-warnings=0`: limpio ·
  suite: **544/544 en 88 ficheros** (suelo 543/88 superado, +1) ·
  cobertura crítica: superada · build: exit 0.
- Goldfish fresco del resultado final (design_critic, contexto fresco):
  **APTO CON CAMBIOS** para el código y las migraciones preparadas —
  explícitamente NO para su ejecución en producción. Sin P0. Tres Major
  corregidos en este mismo expediente: (1) la guarda sale de
  `supabase/migrations/` y gana interbloqueo mecánico de ventana (§4);
  (2) el lookup de su constraint queda calificado por tabla y tipo;
  (3) el asiento registra cada ejecución efectiva (§4). Un Nit (línea de
  estado en ADR-0010) aplicado también.

## 8. Fila (d) de la tabla de evidencia — dos versiones

**Tal como quedará al ejecutar en producción (tras el runbook §5):**

| Patrón | Artefacto | Entorno | Prueba | Estado |
|---|---|---|---|---|
| (d) BYOK — sin persistencia en servidor | Código ADR-0010 + migración 20261113000000 + guarda preparada 20261113000001 | BD real | Conteos post = 0 no-vacías, guarda validada, sonda UPDATE rechazada, notificación con rotación a 30 días | Verificado en producción (con exposición residual por backups hasta que expire su retención y cierre la ventana de rotación) |

**Estado hoy (2026-11-13):**

| Patrón | Artefacto | Entorno | Prueba | Estado |
|---|---|---|---|---|
| (d) BYOK — sin persistencia en servidor | Código ADR-0010 + migración 20261113000000 y guarda preparada 20261113000001 | Mac: tests + Postgres efímero local | Suite 544/88, batería efímera 24/24, cadena 28/28 | **PREPARADO — SIN VERIFICAR en producción**: el código no está desplegado y las migraciones no están aplicadas; mientras tanto, `pp_users.api_key` sigue persistiendo claves en claro en la BD real |

## Candados de este expediente

Sin commit/push/merge (HEAD `e6a5d4a` intacto) · `.env.local` no abierto ·
ninguna BD tocada que no sea un Postgres efímero local creado para la
prueba · ninguna dependencia nueva · ADR-0001/0002 respetados · seguridad
sin aflojar en ningún otro frente.
