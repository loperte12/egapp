/**
 * Catálogo de países (ISO 3166-1 alfa-2 + nombre en español) y ciudades de
 * Guinea Ecuatorial para el selector de ubicación del perfil (P8).
 * África Central destacada al principio; el resto ordenado alfabético.
 */

export interface CountryOption {
  code: string;    // ISO alfa-2
  name: string;    // en español
}

export const GQ_CITIES = [
  'Malabo', 'Bata', 'Mongomo', 'Ebebiyín', 'Evinayong', 'Luba', 'Añisoc',
  'Mbini', 'Acurenam', 'Nsok', 'San Antonio de Palé', 'Riaba', 'Mikomeseng',
  'Niefang', 'Cogo', 'Bitica', 'Corisco', 'Moca',
] as const;

/** Países con Guinea Ecuatorial al frente (por ser la app local). */
export const COUNTRIES: CountryOption[] = [
  { code: 'GQ', name: 'Guinea Ecuatorial' },
  { code: 'CM', name: 'Camerún' },
  { code: 'GA', name: 'Gabón' },
  { code: 'ST', name: 'Santo Tomé y Príncipe' },
  { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'República Democrática del Congo' },
  { code: 'BJ', name: 'Benín' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'CV', name: 'Cabo Verde' },
  { code: 'TD', name: 'Chad' },
  { code: 'CI', name: 'Costa de Marfil' },
  { code: 'DJ', name: 'Yibuti' },
  { code: 'EG', name: 'Egipto' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'SZ', name: 'Esuatini' },
  { code: 'ET', name: 'Etiopía' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bisáu' },
  { code: 'KE', name: 'Kenia' },
  { code: 'LS', name: 'Lesoto' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libia' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malaui' },
  { code: 'ML', name: 'Malí' },
  { code: 'MA', name: 'Marruecos' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauricio' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NE', name: 'Níger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'RW', name: 'Ruanda' },
  { code: 'SN', name: 'Senegal' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leona' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'Sudáfrica' },
  { code: 'SS', name: 'Sudán del Sur' },
  { code: 'SD', name: 'Sudán' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TG', name: 'Togo' },
  { code: 'TN', name: 'Túnez' },
  { code: 'UG', name: 'Uganda' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabue' },
  // Internacional (fuera de África) — corto, ampliable.
  { code: 'ES', name: 'España' },
  { code: 'FR', name: 'Francia' },
  { code: 'PT', name: 'Portugal' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'CN', name: 'China' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'CH', name: 'Suiza' },
  { code: 'BR', name: 'Brasil' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'PE', name: 'Perú' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'DO', name: 'República Dominicana' },
];

/** Países africanos disponibles en el selector de Buscar Work (sin lista de
 *  ciudades en BD: el usuario escribe la ciudad libremente). */
export const AFRICAN_COUNTRY_CODES = COUNTRIES.filter((c) => c.code !== 'GQ').map((c) => c.code);
