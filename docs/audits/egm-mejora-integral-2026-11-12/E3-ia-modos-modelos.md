# E3 — IA: modelos veraces, modos honestos y secretos con ciclo de vida
## Prompt exacto
«PromptPerfect (AI SDK 6, 3 proveedores BYOK): diseña cómo la plataforma deja de mostrar modelos que no ejecuta, de persistir claves contra su propio contrato y de puntuar con una vía muerta, sin golden set disponible y sin romper los 511 tests.»
## Brief
Hallazgos: F3-01, F3-07, F3-08, F3-09, F3-10, F3-11(parcial), F3-13. Patrones: PP-01, PP-02, PP-03, PP-08, PP-13.
## Draft v1
1. F3-09: nuevo `src/lib/modelCatalog.ts` (datos puros, cliente+servidor): id y etiqueta por proveedor = los que `providers.ts` usa por defecto (`gemini-3.5-flash`, `gpt-6-astra`, `claude-3-5-haiku-latest`). `providers.ts` importa los ids del catálogo (los overrides por env siguen mandando). AppSettingsPanel y control-room derivan etiquetas y literales de guardado del catálogo. Test unitario del catálogo + providers.test.
2. F3-08: la descripción del modo production en el selector pasa a declarar «Production Audit — requiere vincular un proyecto»; sin cambio de disponibilidad (retirarlo sería decisión de producto).
3. F3-10: se elimina el parseo muerto de `parsePromptScore` para `prompt_score` en ambas rutas (el system prompt prohíbe el marcador y el delimiter lo descarta: la columna queda null por diseño, no por dato); comentario en resultInsights declara la heurística visible como estimación local.
4. F3-01 parcial: `handleLogout` (useWorkspaceSession) y `clearPromptPerfectLocalAuth` borran también `localStorage['promptperfect:apikey']`; el comentario de `types.ts` se corrige a la verdad (la clave puede residir en el navegador y, si el usuario la guarda en ajustes, en su perfil — nunca se loguea). La persistencia server-side (cifrar o eliminar) queda «pendiente de decisión».
5. F3-11 parcial: remediation con guarda anti-duplicado (si el texto ya contiene el marcador del bloque, no se re-anexa).
Diferido con motivo: F3-07 (elevar modos exige golden set PP-03 antes), F3-13 (verify-key por metadatos).
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes: (1) el catálogo estático no dice la verdad con overrides por env si no alimenta también a config.ts//api/config (que además omite Anthropic); (2) F3-10 mal justificado: parsePromptScore NO es código muerto (se aplica al texto crudo y optimizationLogStats promedia prompt_score) — eliminarlo es decisión de producto, no limpieza.
## Resolve (diseño v2)
1. modelCatalog.ts = única fuente de defaults: lo importan providers.ts y lib/config.ts; /api/config expone también Anthropic desde el catálogo; comentario del catálogo: los overrides por env mandan en runtime y /api/config expone el efectivo. Invariante escrita: el catálogo es hoja pura (solo tipos de @/lib/types, jamás importa providers/config/env de servidor). Etiquetas corregidas a los modelos reales; se declara el cambio de comportamiento de Anthropic (snapshot -20241022 → alias -latest) en la UI. Alcance de literales: panel + control-room + config; los literales persistidos en signup/login/save-history/ppUserSync/enginePrefsStorage quedan listados como residual conocido (createProvider ignora user.model: es cosmético persistido, no de ejecución).
2. F3-10: se DESCARTA la eliminación de parsePromptScore con este motivo; queda documentada la dualidad (score de BD desde texto crudo cuando el modelo emite marcador; heurística local visible) en la auditoría e integración.
3. Logout: helper único clearStoredApiKeys() en enginePrefsStorage junto a API_KEY_STORAGE_KEY; AppSettingsPanel deja de duplicar la constante.
## Review-loop
Ids verificados exactos por Goldfish contra providers.ts. APTO v2.
