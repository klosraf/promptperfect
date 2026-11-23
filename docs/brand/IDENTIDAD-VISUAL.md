# PromptPerfect — Identidad visual

Sistema de marca propio del proyecto. Fuente única de verdad: los maestros
vectoriales de public/brand/; todo recurso raster se genera desde ellos con
npm run brand:assets (script scripts/brand/build-assets.mjs, usa sharp).
Ningún recurso de marca se edita a mano ni se enlaza desde fuera del repo.

## La marca

El glifo nace de la esencia del proyecto — tomar un prompt y devolverlo
mejor, explicando el porqué — y la dibuja literalmente, en orden de lectura:

1. **El prompt tal como llega**: un chevron menor y atenuado (blanco al
   65 %), el signo de prompt en su estado inicial.
2. **El mismo prompt, devuelto mejor**: un segundo chevron mayor y a plena
   fuerza, con su cursor — no es otro prompt, es el mismo, crecido.
3. **La explicación que lo acompaña**: dos trazos breves de anotación junto
   al prompt devuelto, porque en este producto ninguna mejora llega sin su
   porqué.

Nada en la marca es genérico ni intercambiable: la chispa decorativa de la
primera versión se retiró el 2026-11-22 por no sostenerse desde esa esencia
(era el signo universal de «IA», válido para cualquier app). La baldosa usa
el gradiente de la familia del acento de la app (--accent: #4552ff):
#5b6cff, #4552ff, #3a45e6, radio 15/64. Contrastes del glifo sobre el tono
medio del gradiente, calculados desde los tokens: prompt devuelto 5,38:1;
anotaciones 4,01:1; prompt inicial 3,16:1 (elemento gráfico grande, en su
papel deliberadamente secundario).

| Maestro | Uso |
| --- | --- |
| public/brand/logo.svg | Marca completa (baldosa + glifo) |
| public/brand/logo-small.svg | Tamaños de 32 px o menos: solo el prompt devuelto, trazo más grueso |
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

## Sistema visual dual (claro y oscuro)

Un solo sistema de tokens semánticos (`src/app/globals.css`) con dos
esquemas; ningún componente usa hex crudos para superficies, textos o
bordes, así que ambas versiones son el mismo diseño en paridad estricta:

- **Oscuro** (el original del producto, intacto): fondo `#050505`, texto
  `#ececec`, acento `#4552ff`, texto de acento seguro `#8b93ff`.
- **Claro** (derivado de la misma identidad): fondo papel `#f6f6f3`, texto
  `#121216`, secundario `#45454e`, atenuado `#5c5c64`, tarjetas blancas,
  bordes `#e2e2db`/`#cfcfc6`, acento `#4552ff` con texto de acento
  `#3543d6`. Contrastes calculados desde los tokens: texto principal
  ≈15:1, secundario ≈8:1, atenuado ≈5,9:1, acento como texto ≈6,4:1.

Selección de esquema: script previo a la primera pintura en el layout raíz
— elección guardada (`localStorage pp-theme`) → preferencia del sistema →
oscuro por defecto — sin destello ni desplazamiento. Conmutador Sol/Luna en
las cabeceras de landing y workspace. La extensión sigue el esquema del
navegador con los mismos valores (`@media (prefers-color-scheme: light)` en
su popup). El splash y los esqueletos usan los mismos tokens, así que la
experiencia de carga también es dual.

## Splash y estados de carga

- Superficie de arranque: componente BootSplash (marca a 76 px sobre el fondo
  #050505) servido por los loading.tsx de ruta; el workspace y la biblioteca
  usan esqueletos que reproducen su layout final (cabecera fija de 56 px,
  columnas del editor, lista de tarjetas) para que la llegada de datos no
  desplace contenido.
- Indicador honesto: barrido indeterminado con el gradiente de la marca,
  nunca un porcentaje — la carga de una ruta no tiene progreso medible que
  declarar. Nada de temporizadores: el router muestra el splash exactamente
  mientras la ruta carga.
- Movimiento: respiración suave de la marca y barrido de la barra; la regla
  global de prefers-reduced-motion los deja estáticos.
- Primera pintura: fondo desde CSS global desde el primer fotograma,
  color-scheme oscuro declarado y theme-color #050505 en el viewport.
- Extensión: el popup abre con su marca, un estado «cargando ajustes» y los
  campos deshabilitados hasta que la configuración guardada está aplicada;
  nunca muestra valores por defecto editables que un guardado pudiera
  persistir sobre la configuración real.
