# =============================================================================
# parche70 — TODO ACABA EN LA MISMA FILA (y sin perder nada)
#
# LO QUE DESTAPÓ LA PRUEBA (lb61a, 1 FALLA): con el juego único del parche 69, una escritura «vieja»
# por categoría (`category: 'feet'`) creaba una fila de calzado que el lector unificado **ya no
# miraba** (lee `body`): el dato se guardaba y no se podía leer. Una escritura que no se puede leer
# es un fallo, aunque venga de un cliente antiguo.
#
# CÓMO QUEDA: se parte de lo guardado y se aplica lo que llega (MEZCLA), y el resultado se escribe
# SIEMPRE en la fila `body`; después se borra la de `feet`. Así:
#   · una app nueva manda altura, peso y número de una vez → un juego;
#   · una app vieja que mande solo el calzado actualiza el número y NO borra la altura;
#   · nunca quedan dos filas que puedan contradecirse.
#
# Uso en el servidor:  python3 /root/parche70-una-sola-fila.py
# =============================================================================
import shutil
import sys

SELLO = 'una-sola-fila-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """    await this.db.$executeRaw`
      INSERT INTO lifebook.user_measurements
        (user_id, category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, foot_length_cm, foot_width_cm, updated_at)
      VALUES
        (${userId}::uuid, ${category}, ${gender}, ${height}, ${weight}, ${chest}, ${waist}, ${hip}, ${footL}, ${footW}, now())
      ON CONFLICT (user_id, category) DO UPDATE SET
        gender = ${gender}, height_cm = ${height}, weight_kg = ${weight}, chest_cm = ${chest},
        waist_cm = ${waist}, hip_cm = ${hip}, foot_length_cm = ${footL}, foot_width_cm = ${footW},
        updated_at = now()`;
    /**
     * Al guardar el juego único se borra la fila `feet`: si se quedara, habría DOS sitios con las
     * mismas medidas y podrían contradecirse (que es justo lo que el dueño quiere evitar).
     */
    if (unico) {
      await this.db.$executeRaw`
        DELETE FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid AND category = 'feet'`;
    }
    return this.myMeasurements(userId);"""

N1 = """    /**
     * TODO ACABA EN LA MISMA FILA, Y SE MEZCLA CON LO QUE YA HABÍA.
     *
     * Con un juego único, escribir solo una parte (por ejemplo el número de calzado) no puede borrar
     * el resto: se parte de lo guardado y se aplica lo que llega. Así una app vieja que mande
     * `category: 'feet'` sigue funcionando y su dato NO se pierde, y como todo se escribe en la fila
     * `body` (y la de `feet` se borra) nunca quedan dos copias que puedan contradecirse.
     */
    const previo = (await this.myMeasurements(userId)).body;
    const mezcla = (nuevo: number | null, antes: number | null | undefined): number | null =>
      (nuevo !== null ? nuevo : (antes === undefined ? null : antes));
    const valor = {
      gender: gender ?? previo?.gender ?? null,
      height: mezcla(height, previo?.heightCm),
      weight: mezcla(weight, previo?.weightKg),
      chest: mezcla(chest, previo?.chestCm),
      waist: mezcla(waist, previo?.waistCm),
      hip: mezcla(hip, previo?.hipCm),
      footL: mezcla(footL, previo?.footLengthCm),
      footW: mezcla(footW, previo?.footWidthCm),
    };

    await this.db.$executeRaw`
      INSERT INTO lifebook.user_measurements
        (user_id, category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, foot_length_cm, foot_width_cm, updated_at)
      VALUES
        (${userId}::uuid, 'body', ${valor.gender}, ${valor.height}, ${valor.weight}, ${valor.chest},
         ${valor.waist}, ${valor.hip}, ${valor.footL}, ${valor.footW}, now())
      ON CONFLICT (user_id, category) DO UPDATE SET
        gender = ${valor.gender}, height_cm = ${valor.height}, weight_kg = ${valor.weight},
        chest_cm = ${valor.chest}, waist_cm = ${valor.waist}, hip_cm = ${valor.hip},
        foot_length_cm = ${valor.footL}, foot_width_cm = ${valor.footW}, updated_at = now()`;
    await this.db.$executeRaw`
      DELETE FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid AND category = 'feet'`;
    return this.myMeasurements(userId);"""

PIEZAS = [(A1, N1)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'TODO ACABA EN LA MISMA FILA' in src:
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
    print('escrito commerce.service.ts (una sola fila, con mezcla)')
    return 0


sys.exit(main())
