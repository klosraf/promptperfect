
## Addendum EGM 2026-11-12 (implementación INC-2)

- Desviación registrada (no silenciosa): las desactivaciones puntuales firmadas son **3**, no las 2 estimadas en el resolve: `useWorkspaceSession` (rama terminal sin cliente), `useSavedLibrary` (rama terminal local) y `useOptimizationHistory` (efecto `void load()` — cada setState ocurre tras un await en runtime, pero el compilador no lo prueba a través de los helpers locales con ramas síncronas sin cliente). Profile se resolvió estructuralmente sin desactivación (efecto `.then` + `applyResult`).
- `src/app/api/optimize/route.test.ts`: los mocks de `createProvider`/`resolveIdentity` recuperan `(...args: unknown[])` con `void args` — el linter advirtió `_args` sin uso y TypeScript rechazó el spread hacia un mock sin parámetros. Sin cambio de comportamiento.
- La búsqueda de plantillas usa el estado de búsqueda compartido ya existente en el hook (`searchQuery` filtraba `filteredTemplates` sin input visible en la pestaña); el incremento solo añade el input propio en `TemplatesTab`.
