/**
 * Estilos MapLibre — URLs a los JSON de estilo servidos desde el servidor propio.
 *
 * Los estilos viven en https://egrouteplan.com/maps/style-light.json y
 * style-dark.json. Definen las capas (background, water, roads, buildings,
 * places) con la paleta corporativa Eg Route Plan.
 *
 * Los tiles vectoriales provienen de Protomaps PMTiles servidos por
 * pmtiles-server en el mismo dominio (/maps/tiles/).
 *
 * No hay claves API externas. Todo es auto-hospedado.
 */

import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from '../../../api/config';

export { MAP_STYLE_LIGHT, MAP_STYLE_DARK };
