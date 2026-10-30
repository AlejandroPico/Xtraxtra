# Servicio RSS de Extra Extra

Servicio publicado: https://xtraxtra-rss-apico.alejandropico.chatgpt.site

La web continúa en GitHub Pages. Este servicio consulta exclusivamente canales RSS/Atom y las páginas públicas que anuncian sus canales. No extrae artículos, elimina muros ni recibe búsquedas, guardadas, carpetas o la zona preferida del lector. Las URL solicitadas sí son visibles para el servicio de alojamiento y para sus editores; no se envían cookies del visitante al medio.

## Rutas

- `GET /api/health`: disponibilidad y periodo de caché.
- `GET /api/feed?url=...`: XML del canal, URL final, título, fecha real de recogida y marcas `cached`/`stale`. Los errores devuelven JSON y HTTP 422.
- `GET /api/discover?url=...`: canales anunciados en una web. Si no los anuncia, comprueba tres ubicaciones habituales; solo devuelve candidatos que respondan como RSS/Atom.

Las entradas se comprueban cada vez que se solicitan; se reutilizan hasta diez minutos de caché. Una copia anterior puede conservarse hasta 24 horas cuando el medio falla, identificada como anterior y con su fecha original. La caché no ejecuta tareas mientras la web está cerrada.

Solo se permiten HTTP/HTTPS públicos, sin credenciales ni puertos especiales. Se comprueba DNS y cada redirección, se rechazan direcciones privadas y declaraciones XML externas, y se limitan la respuesta a 4 MB, el tiempo a 14 segundos y los saltos a cuatro. CORS permite el origen del portal, su desarrollo local y el propio servicio. Las operaciones son de solo lectura. CORS no es autenticación ni una cuota de uso.

## Código y pruebas

`rss-service.mjs` contiene toda la lógica del servicio; `app/api/*/route.ts` son los adaptadores del proyecto Vinext alojado en Sites. La aplicación publicada conserva también su proyecto completo y su identidad de alojamiento en el repositorio de fuente de Sites. Estas copias permiten revisar la lógica desde GitHub y trasladarla a otro alojamiento compatible con Fetch, Web Crypto y, opcionalmente, Cloudflare Cache API. Sin Cache API se utiliza una caché temporal en memoria.

No hay claves de API ni variables privadas necesarias. El proyecto alojado utiliza el iniciador Vinext de Sites con sus integraciones de construcción conservadas. Para reproducirlo, crear un proyecto Vinext de Sites, copiar `rss-service.mjs` a `lib/`, y copiar los adaptadores ajustando sus importaciones a `../../../lib/rss-service.mjs`. Ejecutar las pruebas, construir y publicar mediante el flujo del alojamiento.

```sh
node --test services/rss/rss-service.test.mjs
```

La programación de la edición compartida sigue en `.github/workflows/edition.yml`. El servicio de apoyo evita depender exclusivamente de esa programación durante la lectura, pero no garantiza que todos los editores mantengan RSS accesibles ni disponibilidad ilimitada del alojamiento gratuito.
