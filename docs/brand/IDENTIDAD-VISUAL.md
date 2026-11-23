# PromptPerfect — Identidad visual

Sistema de marca propio del proyecto. Fuente única de verdad: los maestros
vectoriales de public/brand/; todo recurso raster se genera desde ellos con
npm run brand:assets (script scripts/brand/build-assets.mjs, usa sharp).
Ningún recurso de marca se edita a mano ni se enlaza desde fuera del repo.

## La marca

El glifo es el prompt de terminal — chevron y guión bajo — con la chispa de
optimización en la esquina superior: lo que la herramienta hace (tomar un
prompt y perfeccionarlo) en un solo signo. La baldosa usa el gradiente de la
familia del acento de la app (--accent: #4552ff): #5b6cff, #4552ff, #3a45e6,
radio 15/64.

| Maestro | Uso |
| --- | --- |
| public/brand/logo.svg | Marca completa (baldosa + glifo) |
| public/brand/logo-small.svg | Tamaños de 32 px o menos: sin chispa, trazo más grueso |
| public/brand/logo-mono.svg | Monocromo currentColor (hereda el color del contexto) |
| public/brand/logo-maskable.svg | PWA maskable: baldosa a sangre completa, glifo en zona segura (80 %) |
| public/brand/lockup.svg | Firma horizontal para fondos claros (texto #0b0d12) |
| public/brand/lockup-dark.svg | Firma horizontal para fondos oscuros (texto blanco) |
| public/brand/og.svg | Imagen social 1200x630 (fondo #050505, resplandor de acento) |

## Recursos generados (no editar; regenerar)

- App Next.js: src/app/icon.svg, src/app/icon.png (512), src/app/apple-icon.png (180),
  src/app/favicon.ico (16/32/48 desde el maestro small), src/app/opengraph-image.png
  y src/app/twitter-image.png (desde og.svg).
- Web/PWA: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png.
- Extensión: extension/icons/icon16.png (maestro small), icon48.png, icon128.png.
- En la interfaz: componente src/components/brand/Logo.tsx (SVG inline, mismo
  maestro) en LandingHeader, cabecera del workspace y héroe de la landing.

## Contraste medido (WCAG, calculado desde los tokens)

| Par | Ratio | Nota |
| --- | --- | --- |
| Blanco sobre #4552ff (acento) | 5,38:1 | Glifo principal |
| Blanco sobre #3a45e6 (stop oscuro) | 6,62:1 | Mejor caso del gradiente |
| Blanco sobre #5b6cff (stop claro) | 4,17:1 | Peor caso; la marca es elemento gráfico grande (exigible 3:1), cumple |
| Chispa #dfe3ff sobre #4552ff | 4,24:1 | Elemento decorativo |
| Mono #4552ff sobre blanco | 5,38:1 | Variante monocromo en claro |
| Mono blanco sobre #050505 | 20,38:1 | Variante monocromo en oscuro |

Legibilidad a tamaño mínimo verificada sobre el render real de 16 px
(maestro small): chevron y guión se distinguen sin ambigüedad.

## Reglas de uso

- No recolorear la baldosa fuera de la familia del acento ni separar el glifo
  de su geometría; para una sola tinta, usar logo-mono.svg.
- Espacio de seguridad: 25 % del lado de la baldosa; tamaño mínimo en pantalla:
  16 px (con el maestro small).
- La firma (lockup) no se reconstruye con otra tipografía: la oficial es
  Inter 700, la fuente de interfaz del producto.
