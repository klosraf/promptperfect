# E7 — Extensión e integraciones: la clave BYOK no sale del dispositivo
## Prompt exacto
«PromptPerfect (extensión Chrome MV3 + ejemplos n8n): diseña la corrección que impide que la clave BYOK se replique a la nube del navegador, mantiene compatibilidad con instalaciones existentes y deja las integraciones documentadas con honestidad.»
## Brief
Hallazgos: F6-09, F6-10, F1-07(relacionado). Patrones: PP-42, PP-10.
## Draft v1
1. F6-09: la clave se escribe SOLO en `chrome.storage.local` (popup: `sync.set({apiUrl, mode, provider})` + `local.set({apiKey})` + `sync.remove('apiKey')` para migrar instalaciones). Lecturas (popup y service worker): prefs desde sync, clave desde local; si local está vacía y sync conserva una clave legacy, se usa esa vez (compatibilidad) — nunca se vuelve a escribir en sync. Las prefs no sensibles (apiUrl/mode/provider) pueden seguir en sync: no son secretos.
2. Default de API: `https://promptperfect-beaglecorp.vercel.app` (despliegue personal) → `https://promptperfect.vercel.app` (canónico del proyecto, ya presente en host_permissions) en service-worker.js, popup.js y popup.html.
3. Sin tests previos de extensión: verificación = `node --check` en ambos JS + grep de invariante (ningún `storage.sync.set` con apiKey; ningún default beaglecorp) + revisión Goldfish del diff. Añadir tests con mocks de chrome.* queda registrado como siguiente paso (no hay infra de tests fuera de src/ y crearla es otro programa).
4. F6-10 DOC: examples/README advierte que la clave del workflow n8n debe ir en credenciales n8n/variables de entorno, nunca como campo Set exportable; el test huérfano se declara como tal.
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueante: la migración solo-en-guardado deja la clave en sync para siempre en quien nunca abra Settings — migración debe ocurrir EN LECTURA en ambos lectores. P2: enumerar los 5 sitios del default personal (SW 1, popup.js 1, popup.html 3: href #link-app, href #link-docs, placeholder apiUrl); no tocar manifest.json ni el allowlist CORS (beaglecorp legítimo ahí) ni el footer de marca.
## Resolve (diseño v2)
1. Migración en lectura (popup y service worker): si local no tiene clave y sync trae una legacy ⇒ local.set({apiKey}) → sync.remove('apiKey') → usar ese valor. El popup puebla el campo desde la ruta combinada antes de habilitar Save (evita sobrescribir con '').
2. Cuotas verificadas por Goldfish: local ~10 MB, la clave <200 B — sin impacto; no hace falta unlimitedStorage. content/universal.js no toca storage (delega por mensaje): sin cambios, declarado.
## Review-loop
APTO v2.
