# =============================================================================
# parche68 — QUÉ MEDIDA DECIDE LA TALLA (tanda L-bis)
#
# PETICIÓN DEL DUEÑO: «elimina las medidas de pecho, cintura, cadera».
#
# POR QUÉ HACE FALTA TOCAR EL SERVIDOR Y NO SOLO LA PANTALLA: hasta ahora la recomendación decidía
# con UNA sola medida (pecho en la parte de arriba, cintura en la de abajo, largo del pie en el
# calzado) y, si no se la daban, respondía «nos falta tu pecho». Quitando esas medidas de la
# pantalla, el asistente se quedaría sin nada con lo que comparar: la recomendación se calcula
# contra la tabla DEL PRODUCTO y esa tabla tiene que declarar la medida que se usa.
#
# QUÉ HACE ESTE PARCHE:
#   1. La medida que decide se elige de una LISTA por tipo de prenda: la primera que el cliente haya
#      dado Y que la tabla de la tienda sepa leer. Orden de la que mejor predice la talla a la que
#      peor: pecho → cintura/cadera → altura → peso. Así, con altura y peso ya hay recomendación.
#   2. Si la tabla no trae NINGUNA de esas medidas, se dice tal cual (no se inventa una talla).
#   3. ARREGLA UN FALLO DE VERDAD: el bucle de afinado leía `weightMinCm`/`weightMaxCm`, columnas que
#      NO EXISTEN (el peso va en `weightMinKg`/`weightMaxKg`). Con `undefined`, la comparación salía
#      siempre «dentro» y el peso no se comparaba nunca: daba +1 a TODAS las tallas por igual. Ahora
#      cada medida lee sus columnas de verdad.
#   4. La ropa ya no exige pecho/cintura/cadera para GUARDAR las medidas: con altura y peso basta.
#
# Uso en el servidor:  python3 /root/parche68-medida-que-decide.py
# =============================================================================
import shutil
import sys

SELLO = 'medida-que-decide-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """    const PRINCIPAL: Record<string, 'chest' | 'waist' | 'hip' | 'footLength'> = {
      top: 'chest', dress: 'chest', bottom: 'waist', shoes: 'footLength', accessory: 'waist', other: 'chest',
    };
    const principal = PRINCIPAL[kind];
    const valorPrincipal = medidas[principal];
    if (valorPrincipal === null) {
      return {
        size: null,
        reason: principal === 'footLength'
          ? 'Nos falta el largo de tu pie para poder recomendarte una talla.'
          : `Nos falta tu ${principal === 'chest' ? 'pecho' : principal === 'waist' ? 'cintura' : 'cadera'} para poder recomendarte una talla.`,
        chartAvailable: true,
      };
    }"""

N1 = """    /**
     * QUÉ MEDIDA DECIDE LA TALLA (tanda L-bis).
     *
     * Antes decidía SIEMPRE una sola: el pecho en la parte de arriba, la cintura en la de abajo, el
     * largo del pie en el calzado. Si no se la daban, la respuesta era «nos falta tu pecho» — y como
     * casi nadie sabe su pecho ni su cintura, el asistente no servía para nada. El dueño lo corrigió.
     *
     * Ahora se usa la PRIMERA medida de esta lista que el cliente HAYA dado y que la tabla de la
     * tienda SEPA leer. El orden va de la que mejor predice la talla a la que peor.
     */
    type Medida = 'chest' | 'waist' | 'hip' | 'height' | 'weight' | 'footLength';
    const ORDEN: Record<string, Medida[]> = {
      top: ['chest', 'height', 'weight'],
      dress: ['chest', 'waist', 'height', 'weight'],
      bottom: ['waist', 'hip', 'height', 'weight'],
      shoes: ['footLength'],
      accessory: ['chest', 'waist', 'height'],
      other: ['chest', 'height', 'weight'],
    };
    /**
     * Las columnas REALES de cada medida y su nombre para el mensaje. El peso va en kg, no en cm:
     * leerlo como `weightMinCm` (que no existe) hacía que la comparación saliera siempre «dentro» y
     * que el peso no se comparara nunca — daba los mismos puntos a todas las tallas.
     */
    const RANGO: Record<Medida, { min: string; max: string; nombre: string }> = {
      chest: { min: 'chestMinCm', max: 'chestMaxCm', nombre: 'pecho' },
      waist: { min: 'waistMinCm', max: 'waistMaxCm', nombre: 'cintura' },
      hip: { min: 'hipMinCm', max: 'hipMaxCm', nombre: 'cadera' },
      height: { min: 'heightMinCm', max: 'heightMaxCm', nombre: 'altura' },
      weight: { min: 'weightMinKg', max: 'weightMaxKg', nombre: 'peso' },
      footLength: { min: 'footLengthMinCm', max: 'footLengthMaxCm', nombre: 'largo del pie' },
    };
    /** ¿La tabla de este producto declara esa medida en alguna talla? */
    const declarada = (m: Medida): boolean =>
      tabla.rows.some((f: any) => (f as any)[RANGO[m].min] !== null && (f as any)[RANGO[m].min] !== undefined
        || (f as any)[RANGO[m].max] !== null && (f as any)[RANGO[m].max] !== undefined);

    const candidatas = ORDEN[kind] ?? ['chest'] as Medida[];
    const declaradas = candidatas.filter(declarada);
    if (!declaradas.length) {
      return {
        size: null,
        reason: 'La tabla de esta tienda no trae ninguna medida que podamos comparar contigo (ni pecho, ni cintura, ni cadera, ni altura, ni peso): pregúntale a la tienda.',
        chartAvailable: true,
      };
    }
    const conDato = declaradas.filter((m) => medidas[m] !== null);
    if (!conDato.length) {
      return {
        size: null,
        reason: `Nos falta tu ${RANGO[declaradas[0]].nombre} para poder recomendarte una talla.`,
        chartAvailable: true,
      };
    }
    const principal = conDato[0];
    const valorPrincipal = medidas[principal] as number;"""

A2 = """      let puntos = critico === true ? 2 : 0;
      for (const [clave, campo] of [['height', 'height'], ['weight', 'weight'], ['chest', 'chest'], ['waist', 'waist'], ['hip', 'hip'], ['footLength', 'footLength']] as const) {
        if (clave === principal) continue;
        const r = dentro(medidas[clave as keyof typeof medidas], fila[`${campo}MinCm` as keyof typeof fila] as number | null, fila[`${campo}MaxCm` as keyof typeof fila] as number | null);
        if (r === true) puntos += 1;
        if (r === false) puntos -= 1;
      }"""

N2 = """      let puntos = critico === true ? 2 : 0;
      // Afinado con las DEMÁS medidas que el cliente haya dado, cada una en SUS columnas (el peso en
      // kg). Antes se leían todas como «…Cm», así que el peso nunca se comparaba de verdad.
      for (const clave of Object.keys(RANGO) as Medida[]) {
        if (clave === principal) continue;
        if (medidas[clave] === null) continue;
        const r = dentro(medidas[clave], (fila as any)[RANGO[clave].min] ?? null, (fila as any)[RANGO[clave].max] ?? null);
        if (r === true) puntos += 1;
        if (r === false) puntos -= 1;
      }"""

A3 = """    let mejor: any = null;
    let mejorPuntos = -1;
    for (const fila of tabla.rows) {
      const critico = dentro(valorPrincipal,
        fila[`${principal}MinCm` as keyof typeof fila] as number | null,
        fila[`${principal}MaxCm` as keyof typeof fila] as number | null);"""

N3 = """    let mejor: any = null;
    let mejorPuntos = -1;
    for (const fila of tabla.rows) {
      const critico = dentro(valorPrincipal,
        (fila as any)[RANGO[principal].min] ?? null,
        (fila as any)[RANGO[principal].max] ?? null);"""

A4 = """    if (!mejor) {
      return {
        size: null,
        reason: `Con tus medidas no hay ninguna talla de esta tabla que encaje. La tabla va de ${tabla.rows[0]?.sizeLabel} a ${tabla.rows[tabla.rows.length - 1]?.sizeLabel}: pregúntale a la tienda.`,
        chartAvailable: true,
      };
    }

    // Nivel de ajuste: dónde cae la medida principal dentro del rango de esa talla.
    const min = mejor[`${principal}MinCm` as keyof typeof mejor] as number | null;
    const max = mejor[`${principal}MaxCm` as keyof typeof mejor] as number | null;"""

N4 = """    if (!mejor) {
      return {
        size: null,
        reason: `Con tu ${RANGO[principal].nombre} no hay ninguna talla de esta tabla que encaje. La tabla va de ${tabla.rows[0]?.sizeLabel} a ${tabla.rows[tabla.rows.length - 1]?.sizeLabel}: pregúntale a la tienda.`,
        chartAvailable: true,
      };
    }

    // Nivel de ajuste: dónde cae la medida que decide dentro del rango de esa talla.
    const min = (mejor as any)[RANGO[principal].min] ?? null;
    const max = (mejor as any)[RANGO[principal].max] ?? null;"""

A5 = """    const nombreMedida = principal === 'chest' ? 'pecho' : principal === 'waist' ? 'cintura' : principal === 'hip' ? 'cadera' : 'largo del pie';
    const extras: string[] = [];
    if (medidas.height) extras.push(`altura de ${medidas.height} cm`);
    if (medidas.weight) extras.push(`peso de ${medidas.weight} kg`);
    return {
      size: String(mejor.sizeLabel),
      fit,
      chartAvailable: true,
      reason: `Según tu ${nombreMedida} de ${valorPrincipal} cm${extras.length ? ` y tu ${extras.join(' y ')}` : ''}, la talla ${mejor.sizeLabel} es la que mejor encaja (ajuste ${fit}).`,"""

N5 = """    /** El nombre y la unidad de la medida que ha decidido, y los extras SIN repetirla. */
    const nombreMedida = RANGO[principal].nombre;
    const unidad = principal === 'weight' ? 'kg' : 'cm';
    const extras: string[] = [];
    if (principal !== 'height' && medidas.height) extras.push(`altura de ${medidas.height} cm`);
    if (principal !== 'weight' && medidas.weight) extras.push(`peso de ${medidas.weight} kg`);
    return {
      size: String(mejor.sizeLabel),
      fit,
      chartAvailable: true,
      reason: `Según tu ${nombreMedida} de ${valorPrincipal} ${unidad}${extras.length ? ` y tu ${extras.join(' y ')}` : ''}, la talla ${mejor.sizeLabel} es la que mejor encaja (ajuste ${fit}).`,"""

A6 = """    if (category === 'body' && chest === null && waist === null && hip === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para la ropa hacen falta al menos el pecho, la cintura o la cadera');
    }"""

N6 = """    /**
     * Tanda L-bis: la ropa ya NO exige pecho, cintura o cadera (casi nadie los sabe y el dueño pidió
     * quitarlos). Con la altura y el peso ya se puede recomendar, siempre que la tabla de la tienda
     * traiga esas medidas.
     */
    if (category === 'body' && chest === null && waist === null && hip === null && height === null && weight === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para la ropa hace falta al menos la altura, el peso, el pecho, la cintura o la cadera');
    }"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3), (A4, N4), (A5, N5), (A6, N6)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'medida que decide' in src or 'candidatas' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n}: ' + viejo.splitlines()[0][:70])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    for viejo, nuevo in PIEZAS:
        src = src.replace(viejo, nuevo)
    open(P, 'w', encoding='utf-8', newline='').write(src)
    print('escrito commerce.service.ts (la medida que decide se elige por orden)')
    return 0


sys.exit(main())
