# =============================================================================
# parche59 — EL SITIO DE LA NOTA, DECLARADO EN EL DTO
#
# El parche 58 añadió `placeName/placeLat/placeLng` a `createNote`, pero el DTO del controlador es
# **estricto** (`forbidNonWhitelisted`): un campo que no esté declarado devuelve
# `400 property placeName should not exist`. Es la regla del proyecto, y aquí se cumplió de la peor
# manera: la nota se publicaba sin sitio y el feed salía vacío al pedir un radio.
#
# Uso en el servidor:  python3 /root/parche59-dto-sitio.py
# =============================================================================
import shutil
import sys

SELLO = 'dto-sitio-20260214'
CTL = '/opt/mirror/app/src/lifebook/lifebook.controller.ts'

VIEJO = """  /** TANDA C: productos de MI tienda que van dentro de la nota (máx. 9). */
  @IsOptional() @IsArray() @IsString({ each: true })
  productIds?: string[];
  @IsOptional() @IsIn(LINK_TYPES)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
}"""

NUEVO = """  /** TANDA C: productos de MI tienda que van dentro de la nota (máx. 9). */
  @IsOptional() @IsArray() @IsString({ each: true })
  productIds?: string[];
  @IsOptional() @IsIn(LINK_TYPES)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
  /**
   * TANDA I — EL SITIO DE LA NOTA (POI): el lugar exacto y sus coordenadas.
   *
   * Se declaran aquí porque el DTO es estricto: sin esto el servidor rechaza la publicación con
   * «property placeName should not exist» y la nota se queda sin sitio (y sin sitio no puede salir
   * en «cerca de mí»).
   */
  @IsOptional() @IsString() @MaxLength(120)
  placeName?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  placeLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  placeLng?: number;
}"""


def main():
    src = open(CTL, encoding='utf-8').read()
    if 'TANDA I — EL SITIO DE LA NOTA (POI): el lugar exacto' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(CTL, f'{CTL}.bak-{SELLO}')
    print(f'respaldo: {CTL}.bak-{SELLO}')
    open(CTL, 'w', encoding='utf-8', newline='').write(src.replace(VIEJO, NUEVO))
    print('escrito lifebook.controller.ts')
    return 0


sys.exit(main())
