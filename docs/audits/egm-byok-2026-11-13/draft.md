# Draft EGM — Diseño de remediación BYOK en servidor · F2-08/F3-01

Base: `brief.md` de esta carpeta (mapa verificado fichero:línea).
Skill gobernante: `endurecimiento_saas` patrón (d): la clave nunca persiste en
claro; custodia por topología con modelo de amenaza; migración del stock con
doble lectura y verificación; rotación y pérdida/compromiso declarados antes
de implantar.

## Modelo de amenaza (qué compromiso derrota cada opción)

| Compromiso | A: no persistir | B: Vault | C: KEK en env |
|---|---|---|---|
| Volcado de la BD (SQLi, backup filtrado, service-role filtrada) | **Derrotado**: no hay clave alguna | Derrotado: solo ids + cifrado pgsodium | Derrotado si la KEK no está en el volcado |
| Volcado BD + host de la app (env completo) | **Derrotado** (nada que descifrar) | Derrotado si la clave raíz de Vault es externa; degradado si vive en la misma BD/host | **NO derrotado**: KEK y BD caen juntas (la skill lo declara ofuscación reforzada, no separación) |
| Logs/backups históricos con el stock en claro ya persistido | NO lo resuelve ninguna opción: exige nulificación + recomendación de rotación al usuario (ver §5) | igual | igual |
| Compromiso del navegador del usuario (perfil/XSS) | No derrotado (la clave vive ahí) — es la topología que el producto ya promete y el usuario controla; logout la borra | No derrotado igual en cliente, y además existe copia en servidor | igual que B |
| Necesidad funcional de la copia en servidor | **Inexistente** (mapa: cero lectores) | — | — |

## Opciones

### A — Dejar de persistir en servidor (RECOMENDADA)
La clave vive solo en el cliente (`localStorage`, por proveedor), que ya es el
único consumidor real. El servidor la recibe por petición (Bearer/body) cuando
el cliente quiere optimizar, y no la guarda.

Cambios:
1. `parseUpdateUserBody` (ADR-0002): sigue aceptando `api_key` en el body por
   compatibilidad con clientes ya desplegados y lo **valida igual** (tipo/cota
   2000 → mismo 400), pero **no lo devuelve** en `value`. `UpdateUserBodyValue`
   pierde `apiKey`.
2. `update-user/route.ts`: nunca escribe `api_key`; el comentario de frontera
   se reescribe: el servidor no persiste claves BYOK; `api_key` en el body se
   acepta y se descarta.
3. Clientes: `AppSettingsPanel.handleSave` y `control-room.handleContinue`
   dejan de enviar `api_key` en el body (siguen guardando en localStorage y
   confirmando provider/model en servidor, sin cambios de UX).
4. Altas: signup/jsonLoginSuccess/save-history dejan de escribir `api_key: ''`
   (la columna conserva su `DEFAULT ''` hasta la migración de datos).
5. Tipos/comentarios: `src/lib/types.ts:23` se reescribe (ya no «also persisted
   in their profile»); `src/types/database.ts` conserva `api_key?` en el insert
   marcado legacy hasta que la migración de datos se ejecute, porque la columna
   sigue existiendo en el esquema desplegado.
6. Vestigio: control-room:26,57 pierde el campo `api_key` del tipo de estado.
7. ADR nuevo: `docs/adr/0010-byok-client-only.md`.

Compatibilidad / ventana: no hay doble lectura porque no hay lector. La ventana
es de despliegue: (i) desplegar este código (deja de escribirse stock nuevo);
(ii) ejecutar la migración de datos preparada (nulifica el stock y pone
guarda). Un rollback del código anterior a (i) después de (ii) haría fallar el
guardado de ajustes (la guarda CHECK rechaza el UPDATE con clave) — el runbook
lo declara y ordena retirar la guarda antes de un rollback post-migración.

### B — Supabase Vault
Protege el volcado de BD, pero: (1) sigue existiendo una copia en servidor de
un secreto sin consumidor — custodia sin función; (2) contradice la promesa
publicada del README en vez de cumplirla; (3) la disponibilidad de Vault/
pgsodium en el proyecto real NO es comprobable desde este entorno (puerta
previa obligada); (4) exige RPC de descifrado con service-role en la ruta de
lectura que hoy no existe. Rechazada por YAGNI con fundamento en el mapa.

### C — Envolvente con KEK en env del servidor
La KEK comparte frontera de confianza con la app y, en la topología real
(Vercel), con las mismas credenciales de despliegue que la service-role: el
compromiso combinado BD+entorno la derrota. Añade rotación de KEK, recifrado
y versionado para custodiar un dato innecesario. Rechazada.

## Migración de datos preparada (no ejecutada contra ninguna BD real)

`supabase/migrations/20261113000000_nullify_pp_users_api_key.sql`:
1. Asiento sin valores: crea `public.pp_users_api_key_remediation` si no existe
   (conteo y fecha) e inserta el conteo de filas con clave no vacía.
2. `UPDATE pp_users SET api_key = NULL WHERE api_key IS NOT NULL AND api_key <> ''`.
3. Guarda: `CHECK (api_key IS NULL OR api_key = '')` (constraint
   `pp_users_api_key_must_be_empty`), para que ningún código viejo o futuro
   vuelva a persistir un valor.
4. La columna NO se elimina en esta migración: su DROP queda como paso
   posterior soberano tras una ventana de observación (reversibilidad).
La migración no contiene ni imprime ningún valor de clave. Probada solo en
Postgres efímero con claves sintéticas.

## Rotación y pérdida/compromiso (opción A)

- En servidor no hay nada que rotar: no existe KEK ni stock tras la migración.
- Stock histórico: la nulificación cubre la tabla viva; copias en backups o
  réplicas anteriores están fuera del alcance verificable de este entorno.
  Procedimiento declarado: al ejecutar la migración, comunicar a los usuarios
  con clave almacenada (el asiento da el conteo, sin identidades de clave) que
  **roten su clave en el proveedor**, porque no se puede acreditar que copias
  históricas no la contengan.
- Compromiso del cliente: el usuario revoca la clave en su proveedor y la
  sustituye en Ajustes (solo local). Cerrar sesión borra las claves locales
  (`clearStoredApiKeys`).
- Pérdida: no hay custodia que perder; una clave olvidada se reemite en el
  proveedor y se pega de nuevo en el navegador. Multi-dispositivo: el usuario
  introduce su clave en cada navegador — es el comportamiento que el README ya
  promete hoy.

## Verificación prevista

- Tests actualizados: ruta update-user (la clave nunca llega al `update`),
  parser (acepta y descarta, cota intacta), panel de ajustes.
- Gates: typecheck, lint `--max-warnings=0`, suite completa (suelo 543/88),
  cobertura crítica, build.
- Migración probada en efímero con datos sintéticos: stock nulificado, guarda
  rechaza un INSERT con clave, asiento con el conteo correcto, y la salida de
  la migración no contiene la clave sintética.


---

# Enmiendas del resolve (sustituyen a lo anterior donde contradigan)

Ver `resolve.md` para la adjudicación completa. Veredicto: **APTO CON CAMBIOS
APLICADOS** sobre la opción A.

## SQL literal de las migraciones preparadas

El runner (`supabase/migrate.js`) envuelve cada fichero en su propia
transacción; por eso los ficheros no llevan `BEGIN/COMMIT` propios.

### Fichero 1 — `20261113000000_nullify_pp_users_api_key.sql` (stock)

```sql
-- Remediation F2-08/F3-01 (step 1 of 2): nullify the plaintext BYOK stock.
-- Count-only audit seat: this file never selects or prints a key value.
CREATE TABLE IF NOT EXISTS public.pp_users_api_key_remediation (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executed_at timestamptz NOT NULL DEFAULT now(),
  affected_rows integer NOT NULL,
  check_name text NOT NULL DEFAULT 'pp_users_api_key_nonempty_v1',
  expected_post_state text NOT NULL DEFAULT 'zero_nonempty'
);
ALTER TABLE public.pp_users_api_key_remediation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_users_api_key_remediation FORCE ROW LEVEL SECURITY;
-- Revoke from the Supabase API roles when they exist (a bare Postgres has
-- neither role; Supabase always has both). RLS above is already forced with
-- no policies, so API roles are denied regardless.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.pp_users_api_key_remediation FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.pp_users_api_key_remediation FROM authenticated;
  END IF;
END $$;

LOCK TABLE public.pp_users IN SHARE ROW EXCLUSIVE MODE;

-- Idempotent seat: one row per check_name, with the ORIGINAL pre-update count.
INSERT INTO public.pp_users_api_key_remediation (affected_rows)
SELECT count(*) FROM public.pp_users
WHERE api_key IS NOT NULL AND api_key <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pp_users_api_key_remediation
    WHERE check_name = 'pp_users_api_key_nonempty_v1'
  );

UPDATE public.pp_users
SET api_key = NULL
WHERE api_key IS NOT NULL AND api_key <> '';
```

### Fichero 2 — `20261113000001_pp_users_api_key_guard.sql` (guarda, posterior)

Aplicar SOLO tras la ventana de observación (14 días o una release completa,
la mayor; dueño: operador del despliegue) con conteo de escrituras nuevas = 0.

```sql
-- Remediation F2-08/F3-01 (step 2 of 2): guard against future plaintext writes.
-- Rollback (only via the named procedure in REMEDIACION-BYOK-2026-11-13.md):
--   ALTER TABLE public.pp_users DROP CONSTRAINT IF EXISTS pp_users_api_key_must_be_empty;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pp_users_api_key_must_be_empty'
  ) THEN
    ALTER TABLE public.pp_users
      ADD CONSTRAINT pp_users_api_key_must_be_empty
      CHECK (api_key IS NULL OR api_key = '');
  END IF;
END $$;
```

## Lista de cambios de tests/fixtures (grep `api_key`/`apiKey`, 2026-11-13)

- `src/app/api/auth/update-user/route.test.ts` — invertir la aserción: con
  `api_key` en el body, responde 200 y `update` se llama SIN `api_key`;
  nuevo test: guardar con `api_key` presente nunca rompe provider/model.
- `src/lib/apiSchemas.test.ts` — `parseUpdateUserBody` devuelve `value` sin la
  propiedad `apiKey` (ausente, no undefined); el 400 por >2000 se mantiene.
- `src/components/AppSettingsPanel.test.tsx` — el body enviado a update-user
  no contiene `api_key`; el guardado local sigue ocurriendo.
- Sin cambios: `optimizeUserError.test.ts` (redacción, otro frente) y
  `local-scan/route.test.ts` (sin relación). Las altas no tienen fixtures con
  `api_key: ''` en tests (verificado por grep).
- Suelo preservado: 543 tests / 88 ficheros — se reescribe, no se borra.

## Impacto por cohortes de usuario (sustituye a «cambio visible: ninguno»)

- (a) Mismo navegador: la copia local sobrevive; nada cambia.
- (b) Navegador/dispositivo nuevo: nada se restaura desde el servidor; el
  usuario vuelve a pegar su clave (es la promesa ya publicada del README).
- (c) Copia local perdida (logout la borra, storage limpiado) y stock ya
  nulificado: la clave no es recuperable desde el producto; se reemite o se
  recupera en el proveedor. La nulificación es **irreversible en datos,
  reversible en esquema**.

## Gemini (alcance)

Gemini usa la clave de servidor del producto; los clientes nunca envían ni
guardan clave de usuario para gemini (envían `''`, `loadApiKey` devuelve
`''`). No existe clave gemini de usuario persistida: fuera del alcance de
F2-08/F3-01 por inexistencia, no por omisión.

## Waiver registrado frente a la skill

El patrón (d) exige migración del stock «con doble lectura»: con cero
lectores acreditados no hay lectura que duplicar — waiver con evidencia
(grep exhaustivo en resolve.md). La ventana equivalente es de despliegue:
código primero (cesa la escritura), datos después (nulificación + guarda
diferida).


## Corrección tras la primera prueba efímera (2026-11-13)

La prueba en Postgres efímero cazó dos defectos reales del SQL literal, ya
corregidos en los ficheros de migración (el draft queda enmendado por esta
nota): (1) el `REVOKE` directo fallaba en un Postgres sin los roles de
Supabase → revokes condicionales por `pg_roles`; (2) `LOCK TABLE` exige bloque
de transacción explícito y el runner ya envuelve el fichero en una → la
nulificación y el asiento se fusionaron en una sola sentencia
(`WITH nulled AS (UPDATE … RETURNING) INSERT … SELECT count(*)`), de modo que
el conteo es exactamente el de las filas nulificadas, sin ventana entre
conteo y nulificación.


## Corrección tras el Goldfish del resultado final (2026-11-13)

La guarda (fichero 2) se traslada de `supabase/migrations/` a
`supabase/prepared/` — dentro de `migrations/` cualquier corrida de cadena
la aplicaría sin ventana de observación — y gana un interbloqueo mecánico:
su bloque `DO` lanza excepción si el asiento del paso 1 tiene menos de 14
días. Su lookup en `pg_constraint` queda calificado por tabla
(`conrelid = 'public.pp_users'::regclass`) y tipo (`contype = 'c'`). El
asiento del fichero 1 registra cada ejecución efectiva (stock nuevo tras una
primera nulificación se nulifica y se asienta por separado). Todo ello
re-probado en efímero: batería 24/24.
