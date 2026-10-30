# Detección de territorios

Los nombres en español e inglés de `lib/world-territories.js` proceden de [Unicode CLDR](https://github.com/unicode-org/cldr-json/tree/main/cldr-json/cldr-localenames-full/main), consultado el 30 de octubre de 2026. Se conserva la [licencia de Unicode](../third-party/Unicode-License.txt). Se excluyen códigos de prueba, el territorio desconocido y agrupaciones que no corresponden a un país o territorio concreto.

`lib/geography.js` añade nombres habituales, algunas ciudades y las comunidades y ciudades autónomas españolas. Examina titular, extracto y etiquetas; no usa la procedencia del medio ni geolocalización del dispositivo. La detección reconoce menciones, no comprende todo el contexto: puede pasar por alto lugares o confundir un nombre propio con un lugar. Esto se explica junto a los filtros.

La zona preferida solo aumenta moderadamente la relevancia de coincidencias. No elimina otras noticias, no altera el orden cronológico elegido y no permite que una noticia de ayer salte por encima del grupo de hoy.
