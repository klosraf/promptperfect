# Exploración de referentes y pulido integrado — 2026-11-22

Registro del segmento 8 del programa: exploración global del dominio de la
optimización de prompts (optimizadores de plataforma, gestión y versionado,
evaluación, mejora programática y UX de herramientas de prompts), captura de
los patrones que de verdad aportan, e integración de los viables en
PromptPerfect como patrones propios — adaptados a su arquitectura, sin
referencias externas en el producto.

## Patrones adoptados e integrados en este segmento

1. **Análisis en vivo, 100 % local** (`src/lib/promptAnalysis.ts` +
   `PromptAnalysisPanel` bajo el editor): un catálogo de lint determinista
   (términos vagos, formato de salida ausente, restricciones ausentes,
   criterio de éxito ausente, audiencia sin nombrar, exceso de mayúsculas)
   con correcciones andamio de un clic, puntuación por dimensiones
   (claridad, especificidad, estructura, contexto, restricciones) calculada
   con heurísticas transparentes y etiquetada como heurística local, y
   estimación de tokens rotulada como estimación. Sin llamada a modelo:
   funciona sin claves, sin coste y sin latencia.
2. **Variables de plantilla con vista previa compilada**: detección de
   `{{variables}}`, formulario de valores de prueba y compilación en vivo
   dentro del mismo panel; las variables se preservan intactas durante la
   optimización.
3. **Contrato de cambios estructurado**: cada línea de la región de cambios
   declara un único método de edición — ADD, REPLACE, DELETE, EXAMPLE,
   STRUCTURE — (vocabulario de edición único por paso, tomado de la mejora
   programática de prompts). El parser (`src/lib/structuredChanges.ts`) es
   tolerante: las líneas sin etiqueta de ejecuciones anteriores se muestran
   como cambios sin clasificar, exactamente como antes.
4. **La lista de cambios, visible por fin**: la región de cambios existía en
   el contrato de salida y en las exportaciones, pero no se renderizaba en
   el panel de resultados; ahora se muestra con su etiqueta de método junto
   a la explicación, enlazada con el diff palabra a palabra que el producto
   ya tenía.
5. **Delta de longitud visible**: insignia de tokens estimados
   original → optimizado con variación porcentual en el panel de resultados.

## Diferido con causa (diseño, no defecto)

- **Aceptación/rechazo por cambio individual**: exige regeneración parcial o
  composición por tramos sobre la salida en streaming; el diff actual es de
  lectura. Se deja como diseño para un segmento propio.
- **Versiones inmutables en la biblioteca**: la biblioteca mezcla filas
  locales y de servidor tras una forma unificada; versionar texto +
  configuración de forma íntegra toca el esquema de servidor, así que se
  secuencia con el acto de base de datos de producción, no antes.
- **Evaluación con conjuntos dorados y rúbricas por dimensión sobre salidas
  del modelo**: requiere protocolo de medición propio (suelo, n, intervalo)
  antes de publicar cifra alguna; la puntuación local de este segmento es
  heurística sobre el borrador, no una evaluación del modelo.

## Verificación

Puertas completas sobre el árbol del segmento: typecheck, lint, build,
presupuesto de bundle y suite Vitest íntegra, además de los tests nuevos de
las dos bibliotecas y del panel (26 tests dirigidos en 5 ficheros).
