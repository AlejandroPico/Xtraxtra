# Extra Extra

Un lector RSS gratuito y sin cuentas, inspirado en los antiguos lectores de feeds y en Google Currents.

## Qué incluye

- Mosaico, tarjetas o lista, adaptados a móvil y escritorio.
- Selección de medios, secciones, búsqueda, idioma, antigüedad y noticias sin leer.
- Temas detectados por reglas: elecciones, vivienda, accidentes, inundaciones, etc. La búsqueda permite seguir cualquier otro asunto.
- Agrupación por similitud de titulares, idioma y cercanía temporal, con todas las coberturas accesibles. Puede desactivarse; no es un sistema semántico ni reúne versiones en idiomas distintos de forma fiable.
- Relevancia por actualidad y número de medios distintos; orden cronológico o por cobertura. No mide credibilidad ni importancia objetiva.
- Lector del texto distribuido por el medio en su RSS. No descarga páginas de artículos ni elimina muros de pago. Algunos RSS entregan solo titulares o extractos.
- Traducción local al español en navegadores con `Translator`. Alternativa mediante enlace a Google Translate, que recibe la URL al abrirlo.
- Temas mañana, tarde, noche y automático; seis tipografías, tamaño de lectura e imágenes opcionales.
- Guardadas con copia del texto, historial local, exportación/importación JSON y OPML para las suscripciones del catálogo.
- Estado de cada fuente, fecha de edición y aviso de retraso. Si falla una fuente, conserva noticias de la edición anterior hasta siete días.
- Favicon ilustrado en la raíz: un joven vendedor de periódicos con boina, con versiones para navegador, Android e iOS.

## Ejecutar

Python 3.12+ y Node.js 22+ para las comprobaciones. Sin dependencias que instalar ni claves de API.

```sh
npm run collect
npm run dev
```

Abre `http://127.0.0.1:4173`. El servidor publica esta carpeta; no abras `index.html` con `file://`.

```sh
npm run check
npm test
```

## Publicación gratuita en GitHub Pages

En **Settings → Pages → Build and deployment → Source**, selecciona **GitHub Actions**. El flujo `.github/workflows/edition.yml` recoge los RSS y publica únicamente los archivos públicos. Se ejecuta al subir cambios a `main`, manualmente desde Actions y aproximadamente cada 20 minutos (minutos 7, 27 y 47).

El flujo intenta configurar Pages automáticamente. Si GitHub no permite hacerlo con el token del repositorio, activa GitHub Actions como origen en Settings → Pages y vuelve a ejecutar el flujo. No hay servidores de pago ni proxies de artículos.

El recolector usa seis conexiones como máximo, 18 segundos de espera por fuente y un límite de 4 MB por feed. La caché de Actions conserva la edición entre recogidas sin llenar el historial Git con noticias. El JSON incluido es una edición real inicial; la web se actualiza durante el despliegue y no tiene por qué coincidir con el JSON del repositorio.

GitHub Actions **no garantiza tiempo real**: las ejecuciones programadas pueden retrasarse y, en repositorios públicos sin actividad durante 60 días, GitHub puede desactivar la programación. Un fallo de red o despliegue conserva la web publicada. El navegador consulta la edición cada cinco minutos mientras está visible. «Actualizar portada» consulta la edición publicada; no fuerza una recogida de los medios.

Documentación: [programación de Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Añadir medios

Edita `data/sources.json`. Cada entrada tiene `id` único, `name`, `url`, `feed`, `language`, `region` y `category`. Usa un RSS/Atom público del editor y comprueba sus condiciones antes de incluirlo en una publicación pública. La disponibilidad de un RSS no equivale por sí sola a una licencia de redistribución. La atribución y los enlaces permanecen visibles.

Algunos medios cambian sus RSS, los bloquean o dejan de mantenerlos. La interfaz muestra «No disponible», sin inventar noticias. OPML reconoce medios del catálogo e informa de los pendientes. No añade URLs arbitrarias al servidor: las nuevas fuentes deben incorporarse al catálogo del repositorio.

## Privacidad y límites

Preferencias y guardadas viven en `localStorage`, en este navegador. No hay sincronización entre dispositivos: exporta una copia para trasladarlas. Sin analítica propia. Las imágenes se solicitan al medio sin cabecera Referer y pueden ocultarse. Google Fonts sirve DM Sans y Libre Caslon Display; si falla, se usan fuentes del sistema. Los feeds se convierten a texto plano; la interfaz escapa los textos y admite únicamente enlaces HTTP/HTTPS.

Las categorías y temas usan reglas locales, sin IA de pago. Pueden clasificar mal una noticia. La agrupación no detecta todas las coberturas y puede producir asociaciones erróneas. No hay acceso universal a artículos completos o de suscripción.

Autor: [Alejandro Pico](https://alejandropico.github.io/Portfolio/) · [Repositorio](https://github.com/AlejandroPico/Xtraxtra)


## Interfaz compacta e instalación (1.1)

La cabecera de escritorio permanece visible al desplazarse. La búsqueda y Leer después están en ella; Filtros reúne presentación, orden, periodo, idioma y agrupación. La franja inferior muestra la fecha y la hora real de la edición, con actualización manual. Secciones y radar preceden directamente a las noticias. El mosaico calcula las columnas según el ancho disponible y conserva el orden de prioridad en la primera fila.

En pantallas de hasta 760 px, las mismas herramientas pasan a un menú lateral izquierdo. El botón de hamburguesa permanece fijo; dentro del menú aparece el favicon para cerrarlo. También se cierra con el botón, al tocar fuera, con Escape o al deslizar hacia la izquierda. Un arrastre vertical suficiente al principio de la portada actualiza la edición; no se activa en los controles ni al desplazar las listas de secciones y temas.

Los marcadores sobre las imágenes guardan para Leer después. En noticias sin imagen siguen disponibles sobre el titular. Las coberturas comparables se muestran sobre la imagen. La hora aparece junto al nombre del medio, sin barra inferior. El modo noche utiliza azules oscuros y grises azulados; mañana y tarde mantienen sus paletas.

La web incluye manifiesto con identidad estable, PNG de 192/512 px, icono adaptable y apple-touch-icon, junto a un service worker limitado a esta ruta del proyecto. En Android, Instalar usa la oferta del navegador cuando está disponible. En iPhone/iPad se muestran instrucciones para Compartir → Añadir a pantalla de inicio. La instalación depende del navegador y se completa desde el dispositivo; no se publica en Play Store ni App Store.

La primera visita con conexión guarda la aplicación y la última edición. Sin red se puede abrir la portada y el texto ya disponible; no se descargan todas las imágenes. La caché sustituye la edición anterior en vez de guardar una copia por cada actualización. Al recuperar conexión se solicita la edición publicada más reciente. Las guardadas de la versión anterior se conservan.

Las pruebas cubren reconocimiento de gestos (sin confundir desplazamientos horizontales o verticales del menú), formato de iconos e identificación de instalación, y recuperación sin red con claves de caché estables. La revisión de navegador comprueba vistas de escritorio y móvil; no sustituye una instalación real en Android y iOS.


## Tanda 1 (1.2)

El plan de las 45 mejoras seleccionadas está en [docs/TANDAS.md](docs/TANDAS.md). Solo la primera tanda está implementada; las otras tres quedan pendientes.

La portada utiliza una sola franja con dos áreas horizontales táctiles: secciones generales y radar. El total de noticias aparece junto a la hora de actualización. La carga añade noticias automáticamente al acercarse al final, sin botón ni pie de paginación. Las noticias se agrupan por día de calendario local, con una separación completa al pasar a ayer y fechas anteriores. El orden por relevancia o cobertura se aplica dentro de cada día. Se recorre la edición disponible, no un archivo histórico ilimitado.

En Filtros se pueden guardar portadas personales, silenciar términos temporalmente, alternar medios y secciones, y elegir la densidad. Buscar admite alternativas con «o» / OR, exclusiones con «sin» / NOT / «-» y frases entre comillas. Las exclusiones afectan a toda la expresión. En Leer después también busca dentro del texto conservado.

Lectura añade controles de interlineado, ancho, márgenes y separación entre párrafos, además de alto contraste, controles mayores y reducción de animaciones. El lector indica la duración aproximada del texto y avisa si se trata de un extracto; el botón de reloj permite devolver la noticia a pendientes. Portadas, silencios y ajustes se conservan en el navegador y se incluyen en la exportación/importación JSON.

La instalación está dentro de Acerca de y se ofrece en móvil. La caché incluye los nuevos módulos para mantener la apertura sin conexión.
