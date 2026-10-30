# Mejoras seleccionadas: cuatro tandas

Selección del usuario del 29 de octubre de 2026. Se conservan los números de `IDEAS.md`. El 39 se pidió dos veces y cuenta una sola: son **45 mejoras**. Las cuatro tandas están implementadas. Los límites de traducción, audio y avisos se detallan al final.

## Ajustes inmediatos de la portada — implementados

- Secciones generales y radar en una sola franja, con dos zonas de desplazamiento horizontal independientes y un separador.
- Instalación retirada de las herramientas principales y situada en Acerca de, visible en móvil.
- Carga progresiva automática al acercarse al final, sin botón ni pie de paginación.
- Noticias organizadas por días de calendario: hoy, ayer y fechas anteriores. Orden y diversidad se aplican dentro de cada día; no se mezclan días antiguos con el actual.
- Sin encabezado visible «Portada / historias»; el total pasa a la franja de actualización.

## Tanda 1 — portada, búsqueda y lectura — implementada

| Idea | Mejora | Acceso |
| --- | --- | --- |
| 13 | Silenciar temas durante 24 horas, una semana o hasta retirarlos | Filtros → Silenciar temas |
| 14 | Búsquedas combinadas con OR / «o», exclusiones y frases entre comillas | Buscar |
| 15 | Portadas personales con medios, sección, búsqueda, idioma, periodo, orden y diversidad | Filtros → Portadas personales |
| 16 | Alternar medios y secciones, con límites de noticias consecutivas | Filtros → Diversidad |
| 32 | Volver a marcar una noticia como pendiente y conservarla en Leer después | Botón de reloj del lector |
| 36 | Buscar también en el texto completo conservado de las guardadas | Buscar, estando en Leer después |
| 39 | Interlineado, ancho, márgenes y separación entre párrafos | Lectura → Distribución del texto |
| 41 | Duración aproximada del texto disponible; identificación de extractos | Cabecera del lector |
| 54 | Densidad compacta, normal o amplia | Filtros |
| 56 | Alto contraste, controles mayores y reducción de animaciones | Lectura → Accesibilidad |

Preferencias, portadas y silencios se guardan en este navegador y forman parte de la copia JSON exportable. Las portadas no incluyen ajustes de lectura ni sustituyen los silencios globales. La diversidad no descarta noticias si faltan alternativas. La carga progresiva recorre las noticias de la edición disponible; no constituye un archivo histórico ilimitado.

## Tanda 2 — medios y territorio — implementada

- **1.** Añadir medios desde la aplicación.
- **2.** Descubrir canales RSS a partir de una web.
- **3.** Importación OPML completa, incluidos medios fuera del catálogo.
- **4.** Carpetas de medios.
- **5.** Medios prioritarios.
- **6.** Prensa local y regional.
- **7.** Lenguas cooficiales.
- **8.** Fuentes primarias.
- **9.** Detección y propuesta de reparación de feeds.
- **10.** Catálogo consultable de fuentes.
- **17.** Noticias cercanas a una zona elegida manualmente.
- **18.** Filtro por territorio del que trata la noticia.

Las funciones 1–10 están en Medios: añadir web/RSS, descubrir canales, importar/exportar OPML con carpetas, marcar prioridades con la estrella, consultar filtros del catálogo y abrir opciones de cada fuente para comprobar o sustituir su RSS. El catálogo pasa de 26 a 47 fuentes e incluye prensa regional, catalán, gallego, euskera, agencias y organismos, además de la Universidad de Cambridge.

Las funciones 17–18 están en Filtros: elegir una zona preferida o filtrar el territorio de la noticia. Se reconocen menciones en titular, extracto y etiquetas, sin usar el país del medio; es una aproximación que puede equivocarse. La zona y las fuentes preferidas influyen en relevancia dentro de cada día, sin ocultar otras noticias ni sustituir el orden cronológico elegido.

El servicio público de apoyo es https://xtraxtra-rss-apico.alejandropico.chatgpt.site. Sirve RSS/Atom y descubre canales de webs públicas, sin extraer artículos ni atravesar suscripciones. No recibe guardadas, búsquedas, zona preferida o carpetas. Las direcciones de canales solicitadas sí llegan al servicio y a sus editores. La caché de canales dura diez minutos y se renueva bajo demanda; no es un recolector permanente cuando nadie abre la web.

GitHub programa su edición a los minutos 3, 13, 23, 33, 43 y 53 de cada hora. Sus retrasos se cubren mediante consultas desde la página abierta y al volver a ella. Los RSS personales se guardan en este navegador (hasta 120, con 30 carpetas); sus noticias se almacenan en IndexedDB. Los ajustes y fuentes forman parte de la copia JSON. Las fuentes con errores conservan su edición anterior y no se falsifica una nueva fecha cuando todas fallan.

## Tanda 3 — coberturas e historias — implementada

- **19.** Agrupación más inteligente.
- **20.** Agrupación entre idiomas.
- **21.** Comparación en paralelo.
- **22.** Aportaciones nuevas de cada cobertura.
- **23.** Cronología de un suceso.
- **24.** Seguimiento de historias.
- **25.** Publicación y actualización diferenciadas.
- **26.** Detección de textos de agencia repetidos.
- **27.** Identificación de fuentes originales.
- **28.** Alternativas de cobertura abierta.
- **29.** Diferenciación entre información, opinión y contenido patrocinado.
- **30.** Explicación de la posición en portada.

Acceso: el botón «Comparar» de las fichas abre una vista con dos textos RSS seleccionables, detalles propios, cronología y fuentes. Cada lector también permite abrir «Coberturas y contexto» y consultar «Por qué aparece en portada». «Seguir historia» añade una entrada a Historias, con nombre editable, novedades, marcado al día y cronología conservada.

La agrupación relaciona entidades, expresiones de sucesos y fechas entre idiomas; mantiene comprobaciones de cifras y lugares. Utiliza reglas locales y diccionarios, sin IA de pago. Es aproximada, no reconoce todas las paráfrasis y puede relacionar ángulos distintos de un mismo suceso. La agrupación se puede desactivar en Filtros.

Los detalles son fragmentos literales diferentes de los RSS disponibles, no hechos nuevos verificados. Las coincidencias comparan texto RSS y créditos de agencia explícitos; no certifican independencia editorial. Los enlaces a referencias proceden del RSS y de declaraciones estructuradas del medio. La primera publicación disponible no demuestra ser la fuente original.

«Comprobar acceso y referencias» consulta las URL al servicio de apoyo, hasta ocho por tanda. Examina la cabecera pública y metadatos del artículo, sin devolver su cuerpo ni atravesar suscripciones. El acceso libre/restringido y el género se atribuyen al medio; si no se declaran, quedan sin especificar. Las alternativas no eliminan muros de pago. Puede ampliarse la búsqueda a otros medios del catálogo.

Las fechas de publicación y actualización se conservan por separado. La cronología distingue fechas del RSS, declaraciones de la web y cambios observados localmente. Una detección local no se presenta como hora de edición del periódico.

El historial vive en IndexedDB de este navegador: hasta 30 historias, 40 coberturas conservadas por historia y 12 cambios observados por artículo. Las copias JSON incluyen las historias. El seguimiento recoge novedades al abrir o actualizar la aplicación; no envía avisos ni reconstruye periodos durante los que no se consultaron fuentes. Los textos guardados de historias pueden ser extractos de hasta 6.000 caracteres. Los avisos opcionales se incorporan en la tanda 4.

## Tanda 4 — organización, idiomas, audio y avisos — implementada

- **33.** Colecciones de Leer después.
- **34.** Etiquetas personales.
- **38.** Lectura consecutiva.
- **40.** Imágenes ampliables y créditos.
- **42.** Traducción de titulares y extractos de la portada.
- **43.** Lectura bilingüe.
- **45.** Lectura en voz alta.
- **47.** Resumen diario opcional con fuentes.
- **52.** Gestos configurables sobre fichas.
- **59.** Alertas selectivas con permiso explícito.
- **60.** Horarios de descanso y agrupación de avisos.

Accesos:

- **33–34:** Filtros → Organizar Leer después crea y renombra hasta 30 colecciones. En el lector, Colecciones y etiquetas permite asignar varias colecciones y hasta doce etiquetas. Los selectores de Filtros muestran solo guardadas de la colección/etiqueta elegida; quitar una colección conserva las noticias.
- **38:** Anterior y Siguiente en el lector recorren una instantánea de la edición filtrada, también desde un resumen. No reordena la cola cuando llegan noticias nuevas.
- **40:** tocar la fotografía del lector abre Ampliar/Ajustar, con desplazamiento de la imagen ampliada. Muestra pie y créditos del RSS cuando existen; nunca infiere la autoría del nombre del periódico ni de los autores del texto.
- **42–43:** Lectura → Idiomas y audio elige idioma y proveedor. Traducir siguientes 4 tarjetas procesa titulares y extractos de cuatro tarjetas cargadas por pulsación. Mostrar traducciones guardadas activa o retira esas traducciones en portada. El lector traduce al idioma elegido y permite original, traducción o pares bilingües; en móvil los pares se apilan.
- **45:** Escuchar/Pausar/Continuar/Detener en el lector. Lectura configura voz, velocidad y avance opcional a la siguiente noticia. Se usa síntesis del navegador y se cancela al cambiar o cerrar la noticia. Las voces en línea se identifican; pueden enviar texto a su proveedor. No garantiza reproducción con pantalla bloqueada.
- **47:** Al día prepara hasta ocho historias del día con extractos literales, diversidad de medios/secciones y enlaces a coberturas relacionadas. No interviene IA. Hay generación manual, descarga de texto y preparación diaria opcional al abrir o mantener abierta la web tras la hora elegida. Conserva siete días en este navegador.
- **52:** Lectura → Gestos configura izquierda y derecha sobre las fichas: sin acción, guardar/retirar, leída, pendiente, siguiente o coberturas. El recorrido debe ser horizontal y suficiente; el desplazamiento vertical y los botones se conservan. Guardar y cambiar la lectura ofrecen Deshacer.
- **59–60:** Al día → Avisos selectivos permite elegir una búsqueda, medios o historias seguidas. Los criterios se combinan con O; solo se consultan los medios seleccionados y se respetan silencios. Por defecto todo está desactivado. Activar avisos dentro de Extra Extra usa su bandeja; solo el botón Activar avisos del sistema solicita permiso al navegador. El descanso usa horas locales y admite medianoche; agrupa coincidencias en intervalos de 5–120 minutos y evita repetir URL. Las coincidencias pendientes caducan a las 24 horas o al dejar de cumplir los criterios.

La traducción local depende de la API Translator y de los idiomas/modelos del navegador. MyMemory es una alternativa externa voluntaria, sin cuenta ni claves, que recibe únicamente los segmentos solicitados. La aplicación consulta el endpoint de lectura, nunca contribuye textos a su memoria. Su cuota anónima publicada es de 5.000 caracteres diarios; la aplicación limita conservadoramente los intentos a 4.500 por navegador y día UTC, sin poder conocer el consumo de otras webs o dispositivos de la misma IP. Cada petición respeta 500 bytes UTF-8. El lector limita la traducción externa a un fragmento de hasta 3.800 caracteres más titular y lo indica; el original completo disponible se conserva. Las traducciones se guardan en IndexedDB (hasta 400 segmentos, reutilizables durante 30 días), sin consultas automáticas al mostrar tarjetas.

Los avisos funcionan mientras una página de Extra Extra está abierta y el navegador permite ejecutarla, incluso en segundo plano con los avisos activados. La actualización sigue siendo de diez minutos, sujeta a la disponibilidad del RSS y a la suspensión del navegador. No hay servidor de envío push, ni alertas con la aplicación cerrada, ni promesa de puntualidad exacta. En iPhone, los avisos del sistema requieren instalar la web en la pantalla de inicio. Los clics de avisos abren Al día, y no abren enlaces ajenos automáticamente.

La copia JSON incluye colecciones, etiquetas, ajustes y resúmenes. Al importarla se desactivan ambos tipos de avisos; no se trasladan permisos del sistema. Las copias anteriores siguen siendo compatibles. No se ha añadido ningún servicio de pago ni se ha cambiado el alojamiento de GitHub Pages.

Referencias: [Translator del navegador](https://developer.chrome.com/docs/ai/translator-api), [API de MyMemory](https://mymemory.translated.net/doc/spec.php), [cuota de MyMemory](https://mymemory.translated.net/doc/usagelimits.php), [síntesis de voz](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), [avisos del service worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).
