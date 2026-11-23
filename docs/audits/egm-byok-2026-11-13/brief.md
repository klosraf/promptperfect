# Brief EGM — Remediación BYOK en servidor (F2-08/F3-01) · 2026-11-13

## Problema

`pp_users.api_key` persiste en claro la clave BYOK (OpenAI/Anthropic) del usuario.
El README (línea 20) promete: «Your API keys are stored locally in your browser
and never saved to our servers». La promesa y el código se contradicen.
Expediente origen: `docs/audits/ENDURECIMIENTO-SAAS-2026-11-13.md`, fila (d2):
«BLOQUEADO POR DECISIÓN SOBERANA». Carlos autorizó la remediación el 2026-11-13.
La BD real no es alcanzable desde este entorno: alcance = diseño + código +
migración de datos preparada y probada solo en Postgres efímero.

## Mapa real del flujo (verificado fichero:línea, 2026-11-13)

**Escritores de un valor no vacío (único camino):**
- `src/app/api/auth/update-user/route.ts:49` — `if (apiKey !== undefined) updates.api_key = apiKey;`
  (service-role, usuario autenticado; comentario en :33-36 afirma que el servidor
  «can call providers on the user's behalf»).
- Valor validado por `parseUpdateUserBody` (`src/lib/apiSchemas.ts:265-271`):
  `api_key` en el body → `value.apiKey`, cota 2000 caracteres.

**Clientes que envían la clave a esa ruta:**
- `src/components/AppSettingsPanel.tsx:99` — body `api_key: localProvider !== 'gemini' ? localKey : ''`.
- `src/app/control-room/page.tsx:110` — body `api_key: provider !== 'gemini' ? apiKey : ''`.

**Escritores de cadena vacía (sin secreto, filas de alta):**
- `src/app/api/auth/signup/route.ts:172` · `src/lib/auth/jsonLoginSuccess.ts:41` ·
  `src/app/api/save-history/route.ts:72` — `api_key: ''`.

**Lectores de `pp_users.api_key`: NINGUNO.**
- Ninguna ruta lee la columna: `src/app/api/profile/route.ts` selecciona columnas
  explícitas sin `api_key` (:119, :187, :413, :478); `jsonLoginSuccess.ts:21,28,45`
  selecciona `id, name, email, provider, model`.
- Ninguna ruta de optimización consulta `pp_users`: `optimize/route.ts`,
  `optimize-sync/route.ts` (:116 clave = Bearer o body) y `translate/route.ts`
  (:49 Bearer o body) usan la clave enviada en la petición o la clave de servidor.
- La afirmación del comentario en update-user:33-36 es falsa: el servidor nunca
  llama a un proveedor con la copia persistida.
- Vestigio: `src/app/control-room/page.tsx:26` tipa `api_key?: string` en el
  estado y :57 lo fija a `undefined` — resto de una lectura que ya no existe.

**Custodia en cliente (funcional, suficiente):**
- `src/lib/client/enginePrefsStorage.ts:69-83` `loadApiKey(provider)` lee
  `localStorage['promptperfect:apikey']` por proveedor (gemini → '').
- `src/hooks/useWorkspaceSession.ts:69,79,115` — la sesión de trabajo usa solo
  esa copia local; al cerrar sesión, `clearStoredApiKeys()` la borra (:126;
  `ppUserSync.ts:144` también).
- Ambos clientes guardan además en localStorage tras guardar con éxito
  (AppSettingsPanel:113-131, control-room:126-136).

**Conclusión del mapa:** persistencia sin consumidor. No existe dependencia
funcional de la copia en servidor: ni optimización sin clave en la petición,
ni recuperación multi-dispositivo, ni lectura administrativa.

## Lentes del brainstorm (resumen)

- Contrarian/YAGNI: custodiar en servidor un secreto que nadie lee es riesgo
  sin función; la opción más segura es no tenerlo.
- Coste: Vault/KMS añaden dependencia, superficie y operación para proteger
  un dato innecesario.
- UX: el cliente ya funciona sin la copia; el único cambio visible es ninguno.
- Migración/compatibilidad: clientes antiguos envían `api_key`; la ruta debe
  aceptarlo y descartarlo, no rechazarlo. Orden: código primero, datos después.
- Observabilidad: el asiento de la migración registra conteos, nunca valores.
- Deuda técnica: comentarios que afirman lo contrario del código
  (update-user:33-36, types.ts:23) se corrigen en el mismo cambio.

## Enfoques candidatos

- **A — Dejar de persistir en servidor.** La clave vive solo en el cliente
  (localStorage, como ya promete el README y como hizo E7 en la extensión).
- **B — Supabase Vault (pgsodium).** `pp_users` guardaría solo el id del secreto.
- **C — Envolvente con KEK en env del servidor.** DEK por registro envuelta
  por una KEK en variable de entorno del host.
