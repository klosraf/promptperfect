# E4 — UX/a11y: lint a cero por patrón real y accesibilidad donde duele
## Prompt exacto
«PromptPerfect (React 19, eslint react-hooks v6, ADR-0008): diseña la corrección de los 12 set-state-in-effect sin eslint-disable en bloque y sin regresiones en los 511 tests, más las correcciones a11y de mayor palanca (foco en Modal, alertas de error, fin de streaming, búsqueda de plantillas).»
## Brief
Hallazgos: B-02/F4-01, F4-03, F4-05(parcial), F4-07, F4-08, F4-10. Patrones: PP-30, PP-31, PP-33.
## Draft v1 — corrección por patrón (cada sitio con su causa)
- Patrón `mounted` (control-room:42, useSavedLibrary:320, useWorkspaceSession:51): `useSyncExternalStore(noopSubscribe, () => true, () => false)` — el idioma React para «estoy en cliente» sin efecto ni setState.
- login:53: el error OAuth se deriva de la URL con `useSyncExternalStore` sobre `location.search` (snapshot servidor '') y se compone con el error de formulario (descartable al interactuar).
- AppSettingsPanel:55: ajuste en fase de render con clave previa (patrón «adjusting state when props change» de la docs de React) sobre `[open, provider, apiKey]` — conserva la semántica, incluida la de tecleo (la clave previa solo resetea cuando la identidad de props cambia de verdad).
- SavePromptButton:50,57: ajuste en render por `historyId` previo; el de `alreadySaved` igual (si ya está guardado, justSaved se apaga en render).
- profile:104 y useOptimizationHistory:163: diferir la carga un tick (`setTimeout(0)` + cleanup) — idioma ya presente en control-room para el mismo problema; el setState deja de ser síncrono en el efecto y la carga sigue siendo cancelable.
- useSavedLibrary:328 y useWorkspaceSession:58: las ramas sin cliente se difieren igual (setTimeout 0 + cleanup); el resto del efecto ya resolvía en `.then`.
- useWorkspaceSession:108: `apiKey` derivado de `provider` con ajuste en render por proveedor previo (lee localStorage, idempotente con applyAuthUser).
A11y: (a) focus-trap en `ui/Modal` (keydown Tab cicla dentro del diálogo; test nuevo en Modal.test). (b) `/app`: errores de optimización y de cuota con `role="alert"` + botón Reintentar que re-despacha la optimización. (c) StreamingPromptOutput: región `aria-live="polite"` que anuncia «Optimización completada» al pasar isStreaming a falso. (d) TemplatesTab: búsqueda por texto (título/contenido/categoría) además de las píldoras. (e) AppSettingsPanel: emojis de proveedor → puntos de color con tokens + nombre textual.
Diferido: F4-02 (migrar diálogos a Modal — riesgo visual sin e2e autenticado), F4-04 (codemod tokens), F4-09 (historial móvil).
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes: (1) setTimeout(0) en 4 sitios es evasión del linter, no corrección — rechazado; (2) el ajuste-en-render exige clave primitiva y tests de terminación/tecleo/reseteo.
## Resolve (diseño v2)
1. Cargas reestructuradas, sin diferidos: profile — fetchAndApply con todos los setState tras await reales (el !supabase se resuelve en el estado inicial de loading) y load imperativo = reset+fetch solo para handlers; useOptimizationHistory — setLoading tras el primer await real en la rama uid y lector local asíncrono en la rama guest; ramas terminales puramente síncronas de sincronización con sistemas externos (sin cliente en useSavedLibrary/useWorkspaceSession): UNA desactivación eslint puntual por sitio con justificación firmada (rama terminal, un solo commit, sin cascada posible) — opción 2 que el propio review admite.
2. AppSettingsPanel: clave primitiva compuesta `open|provider|apiKey` en useState, comparación por valor; test nuevo: (a) termina sin bucle, (b) teclear no se resetea, (c) cambiar props sí resetea. useWorkspaceSession:108 = useState + ajuste por proveedor previo (setApiKey sigue siendo API pública).
3. login: error OAuth derivado + flag de descarte en handlers (documentado: se descarta a la primera interacción).
4. aria-live de streaming derivado en render (región siempre montada), nunca estado desde efecto.
5. Búsqueda de plantillas donde vive el filtro: estado tplSearch en useSavedLibrary junto a filteredTemplates; TemplatesTab solo renderiza el input.
6. useMounted() compartido en src/hooks/useMounted.ts (subscribe estable) para los 3 sitios.
## Review-loop
Goldfish confirmó el patrón mounted como idioma correcto (snapshot de servidor en hidratación, sin mismatch) y Modal preciso (solo falta el trap). APTO v2.
