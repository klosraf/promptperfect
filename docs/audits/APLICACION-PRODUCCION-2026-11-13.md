# Aplicación a producción autorizada el 2026-11-13 — estado: DETENIDA en el paso 0 por falta de acceso real a la BD

- **Autorización del titular (2026-11-13 03:28 MST, «Procede con todo»):** aplicar a la BD real las migraciones `20261112000000_close_guarded_policy_spoofing.sql` y `20261112000001_atomic_guest_usage.sql`, y remediar el BYOK en servidor (F2-08/F3-01) según la skill `endurecimiento_saas`. El merge/push de `feat/db-production-hardening` **no** está incluido y sigue «pendiente de decisión».
- **Resultado:** **nada se aplicó y nada se tocó.** La detención ocurre en el paso 0 (antes de la copia de seguridad), por la causa demostrada abajo. No hay nada que revertir: ningún comando de escritura llegó a ejecutarse contra ninguna base de datos.

## Evidencia del bloqueo (verificada por el padre en el Mac, 2026-11-13)

| Comprobación | Método (sin abrir valores) | Resultado |
|---|---|---|
| `npm run db:check` contra la «BD real» configurada | El propio runner del repo (`supabase/migrate.js --check`, carga `.env.local`) | ❌ `getaddrinfo ENOTFOUND db.your-project.supabase.co` — el host de `DATABASE_URL` es el de la plantilla |
| Host de `NEXT_PUBLIC_SUPABASE_URL` | Script que imprime solo el host, nunca valores | `your-project.supabase.co` — también plantilla |
| Longitudes de claves en `.env.local` | Script que imprime solo longitudes | Anon key: 18 caracteres; service-role: 26 (las reales son JWT de ~200) — valores de plantilla |
| `NEXT_PUBLIC_SITE_URL` / `ALLOWED_ORIGINS` | Valores no secretos | `http://localhost:3000` — entorno local de desarrollo, no producción |
| Otros ficheros de entorno | `ls` | No existen `.env` ni `.env.production`; solo `.env.local` (de plantilla) |
| Supabase CLI / proyecto enlazado | `which supabase`, `ls supabase/config.toml`, `~/.supabase` | CLI no instalada, sin `config.toml`, sin directorio de credenciales |
| Vercel CLI | Instalada (65.2.0) pero proyecto no enlazado (sin `.vercel/`); `vercel whoami` no respondió en 90 s por este túnel | Sin vía acreditada al despliegue desde este Mac |

**Conclusión:** el `.env.local` de este Mac es íntegramente el fichero de ejemplo. Este entorno **nunca ha estado conectado al proyecto Supabase real**: no hay URL real, ni contraseña de Postgres, ni token de gestión. La producción (si el despliegue `promptperfect-beaglecorp.vercel.app` citado en `.env.example` es el vivo) recibe sus credenciales reales de Vercel y del panel de Supabase de su propietario — ninguna de las dos está al alcance de este procedimiento.

## Tabla de evidencia actualizada (skill `endurecimiento_saas`)

| Patrón | Estado tras la autorización | Qué falta para «verificado en producción» |
|---|---|---|
| (a) RLS «guarded» sin spoofing | **Autorizado, NO aplicado — bloqueado por acceso** (no por decisión) | Credencial Postgres real → ejecutar el runbook de abajo |
| (b) Cuota guest atómica (RPC) | **Autorizado, NO aplicado — bloqueado por acceso** | Ídem |
| (d2) BYOK en servidor en claro | **Autorizado; preparación EN CURSO** (diseño EGM + código + migración de datos probada en efímero, coordinador propio) | Diseño e implementación listos + credencial real → ejecutar su migración de datos con el runbook |
| Copia de seguridad previa | **No realizada** — imposible sin BD alcanzable; es el paso 1 en cuanto exista acceso | Ídem |

## Runbook listo para ejecutar en cuanto exista la credencial (orden obligado)

0. **Acceso:** el titular deja en el Mac una `DATABASE_URL` real (directa o pooler de Supabase) — él la introduce; ningún agente la pide ni la recibe por chat.
1. **Verificación previa:** `npm run db:check` (debe listar pendientes solo `20261112*` y, en su día, la de BYOK) + conteos previos (migraciones aplicadas, filas de `pp_users`, filas con `api_key` en claro — solo conteos, nunca valores).
2. **Copia de seguridad verificable:** `pg_dump` en formato custom a `~/Backups/promptperfect/pre-20261112-<fecha>.dump` + `pg_restore --list` íntegro + SHA-256 registrado en este informe. Sin copia válida no se sigue.
3. **Aplicar `20261112000000`** con `node supabase/migrate.js` acotado (o el SQL en transacción) y **verificar en producción**: catálogo `pg_policies` con la definición nueva y sonda anti-spoofing como rol `anon` dentro de una transacción con `ROLLBACK`.
4. **Comprobar la app** tras el paso 3 (typecheck/tests/build locales; la ruta guest y los inserts legítimos siguen aceptados según la sonda).
5. **Aplicar `20261112000001`** y verificar: la RPC `increment_guest_usage` existe, `anon` sin EXECUTE, y la atomicidad se demuestra con dos llamadas en transacción revertida (1ª → 1, 2ª con límite alcanzado → 0 filas).
6. **Migración de datos BYOK** según el informe `REMEDIACION-BYOK-2026-11-13.md`, con su ventana de doble lectura y su verificación post-migración (conteo de claves en claro = 0).
7. **Actualizar esta tabla** con la evidencia ejecutada en producción (fecha, entorno, resultado por fila) y cerrar el expediente.

## Candados respetados en esta detención

Sin commit/push/merge (HEAD `e6a5d4a`) · `.env.local` nunca abierto por un humano/agente (solo lo leen los scripts del propio repo, como están diseñados; las comprobaciones imprimieron hosts y longitudes, nunca valores) · ninguna escritura en ninguna BD · ningún verde forzado.
