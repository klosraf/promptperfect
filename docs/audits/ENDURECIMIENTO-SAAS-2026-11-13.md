# Endurecimiento SaaS aplicado a PromptPerfect — expediente y tabla de evidencia

- **Fecha:** 2026-11-13
- **Skill aplicada:** `endurecimiento_saas` (programa de exploración global 2026-11-13, enfoque E-08: Goldfish provisional NO APTO → rediseño → APTO en review-loop; grounding en el anexo H8: PostgreSQL/Supabase RLS, contadores atómicos, envolvente KMS/Vault, OWASP).
- **Árbol:** `~/Proyecto/promptperfect`, HEAD `e6a5d4a` — sin commit, sin push, sin merge por este expediente.
- **Informe origen:** `docs/audits/INTEGRACION-EGM-PROMPTPERFECT-2026-11-12.md` (SHA-256 `2d4819c6d685bc51dd8fd0bf69a1fc1af65ed153f6997346e497ee88ed3b7bc3`).
- **Premisa de la skill (no negociable):** los patrones están diseñados y redactados; ningún control se afirma «verificado» sin evidencia ejecutada en el entorno que se afirma. Los tests en verde sobre código sin aplicar acreditan el código, no la protección en producción.

## Tabla de evidencia por patrón

| Patrón | Informe origen | Artefacto | Entorno ejecutado | Prueba y resultado | Estado |
|---|---|---|---|---|---|
| (a) RLS no falsificable — políticas «guarded» | INTEGRACION-EGM §2/§4 (E2, F2-02) | Migración `supabase/migrations/20261112000000_close_guarded_policy_spoofing.sql` (guarded + `user_id IS NULL` + `share_id IS NULL`, WITH CHECK verbatim de 20261012); sondas §7b de `supabase/tests/verify.js` con SAVEPOINT propio | Postgres efímero local en el Mac (clúster desechable, 2026-11-12 ~05:52 MST). **La BD real no se tocó** | Pipeline completo: 27 migraciones → `--check` → seed → verify **61/0**; las sondas de spoofing (INSERT en logs, INSERT en history, `share_id` prefijado) son rechazadas y los inserts guest legítimos aceptados | **SIN VERIFICAR en producción — bloqueado por decisión soberana**: la migración no está aplicada a la BD real; hasta aplicarla, el spoofing de las políticas «guarded» **sigue presente en la BD viva** |
| (b) Contabilidad de uso sin sobreconsumo por concurrencia (cuota guest) | INTEGRACION-EGM §2/§4 (E5, F2-02) | Migración `supabase/migrations/20261112000001_atomic_guest_usage.sql` — RPC `increment_guest_usage` transaccional, con REVOKE a anon | Postgres efímero local (misma corrida). **La BD real no se tocó** | RPC probada: 1ª llamada → 1; 2ª llamada con límite 1 → 0 filas; anon sin EXECUTE. En producción la ruta guest-usage sigue usando el **camino legado** (con log de aviso) | **SIN VERIFICAR en producción — bloqueado por decisión soberana**: misma decisión que (a). Límite honesto del invariante: la identidad invitada (IP/cookie) es falsificable por construcción — el contador atómico impide el sobreconsumo por concurrencia, disuade el abuso, no lo garantiza |
| (c) Rate-limit — local por defecto | INTEGRACION-EGM §4 (F2-04) | Limitación por ruta en código (throttling de rutas P2 write/share/claim y de lecturas sobre BD), con tests en la suite | Tests locales en el Mac: suite 543/543 en 88 ficheros (2026-11-12). La topología del despliegue real no está acreditada en este expediente | Suite en verde sobre el código. El disparador de cambio de la skill (>1 instancia efectiva, instancias efímeras sin afinidad, balanceador sin sticky) **no está acreditado** en la topología real | **APLICADO EN CÓDIGO (local, es el default correcto de la skill) — SIN VERIFICAR en producción**. Rate-limit **distribuido: bloqueado por decisión soberana** (F2-04, decisión de infraestructura); adoptarlo sin disparador acreditado añadiría dependencia, latencia y otra credencial, no «más endurecimiento» |
| (d1) BYOK — extensión Chrome | INTEGRACION-EGM §5 (E7) | Clave BYOK solo en `chrome.storage.local`, con migración en lectura (local.set → sync.remove) en popup y service worker; prefs no sensibles en sync | Mac, verificación del cierre: `node --check` en ambos JS + grep de invariantes (sin daemon/infra de tests de extensión — declarado en el informe origen) | La clave ya no viaja a `chrome.storage.sync`; la custodia local queda en el almacenamiento de la extensión del propio navegador del usuario | **APLICADO EN CÓDIGO** en el alcance de la extensión. No es cifrado envolvente: es la custodia que corresponde a esa topología, declarada como tal |
| (d2) BYOK — persistencia en servidor | INTEGRACION-EGM §4 (F2-08 = F3-01) | Columna `pp_users.api_key` — la clave BYOK persiste **en claro** en la BD | Sin entorno: no hay implantación que ejecutar | No existe cifrado envolvente (DEK por registro envuelta por KEK en KMS/Vault), ni migración del stock en claro, ni rotación con doble clave, ni procedimiento de pérdida/compromiso — todo ello es diseño pendiente | **BLOQUEADO POR DECISIÓN SOBERANA**: cifrar en reposo con envolvente DEK/KEK, o dejar de persistir la clave. Riesgo mientras tanto: un volcado de la BD expone las claves BYOK de los usuarios en claro |
| Puerta continua rol × tabla × operación | INTEGRACION-EGM §5 (E6) + skill, patrón (a) | `supabase/tests/verify.js` (aserciones de esquema, CHECK, RLS y sondas negativas) + job `db.yml` de CI, que ejercita las migraciones en un Postgres efímero y cuyo guard ahora hace `exit 1` si `git diff` falla | Local: Postgres efímero del Mac, verify 61/0 (2026-11-12). **CI remoto: sin evidencia** — la rama no está pusheada, no consta ninguna corrida de CI sobre este diff | La práctica existe y está probada en local; la puerta continua sobre todo diff de migraciones que exige la skill no está acreditada en CI | **SIN VERIFICAR como puerta continua en CI**. Requisito registrado: política sin test asociado = fallo de release |

## Salida de la evaluación (una de las dos que admite la skill)

**«Bloqueado por decisión soberana»** — no «verificado», y no se agrega como aprobado.

Ítems, titular de la decisión y riesgo mientras tanto (titular de todos: Carlos):

1. **Aplicar las migraciones `20261112*` a la BD real** — desbloquea (a) y (b). Riesgo mientras tanto: spoofing «guarded» vivo en BD y cuota guest por el camino legado.
2. **BYOK cifrado o no persistencia en servidor** (F2-08/F3-01) — desbloquea (d2). Riesgo mientras tanto: claves BYOK en claro en `pp_users.api_key`.
3. **Rate-limit distribuido** (F2-04) — solo si se acredita el disparador topológico; hoy el default local es la posición correcta según la skill.

Las filas (a), (b), (c)-producción y la puerta continua quedan además como **«sin verificar»** en producción/CI: su evidencia existe en Postgres efímero local y en tests, y eso acredita el código — no la protección desplegada.

## Candados de este expediente

Sin commit/push/merge (HEAD `e6a5d4a` intacto) · ninguna migración aplicada a la BD real · `.env.local` no abierto · ninguna dependencia nueva · este documento es el único fichero que añade la aplicación de la skill.
