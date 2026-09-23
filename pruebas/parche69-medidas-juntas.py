# =============================================================================
# parche69 — LAS MEDIDAS SON UN JUEGO ÚNICO (tanda L-ter)
#
# PETICIÓN DEL DUEÑO: «altura, peso y el número de calzado van juntos, el guardado será juntos».
#
# CÓMO ESTABA (tanda J): dos filas por persona, `body` (ropa) y `feet` (calzado), pensadas para ser
# independientes («tener medidas de cuerpo no obliga a tener medidas de pie»). El asistente guardaba
# una u otra según la prenda, así que se podía acabar con la altura guardada y el número de calzado
# no, o al revés — y para el comprador eso es un lío: son SUS medidas, no dos expedientes.
#
# CÓMO QUEDA: se lee y se escribe UN juego. Al guardar sin categoría (o con «all») se escribe en la
# fila `body` **y se borra `feet`** para que no queden dos copias que puedan contradecirse.
# `myMeasurements` devuelve el mismo juego en las dos claves, así que **nada de lo que ya lo leía se
# rompe** (ni la app vieja, ni la pantalla de «Mis medidas»).
#
# Uso en el servidor:  python3 /root/parche69-medidas-juntas.py
# =============================================================================
import shutil
import sys

SELLO = 'medidas-juntas-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """  async myMeasurements(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm,
             foot_length_cm, foot_width_cm, updated_at
        FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid`;
    const de = (cat: string) => {
      const f = filas.find((x) => String(x.category) === cat);
      if (!f) return null;
      return {
        category: cat,
        gender: f.gender ?? null,
        heightCm: f.height_cm === null ? null : Number(f.height_cm),
        weightKg: f.weight_kg === null ? null : Number(f.weight_kg),
        chestCm: f.chest_cm === null ? null : Number(f.chest_cm),
        waistCm: f.waist_cm === null ? null : Number(f.waist_cm),
        hipCm: f.hip_cm === null ? null : Number(f.hip_cm),
        footLengthCm: f.foot_length_cm === null ? null : Number(f.foot_length_cm),
        footWidthCm: f.foot_width_cm === null ? null : Number(f.foot_width_cm),
        updatedAt: f.updated_at ?? null,
      };
    };
    return { body: de('body'), feet: de('feet') };
  }"""

N1 = """  async myMeasurements(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm,
             foot_length_cm, foot_width_cm, updated_at
        FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid`;
    const de = (f: any) => (f ? {
      category: String(f.category),
      gender: f.gender ?? null,
      heightCm: f.height_cm === null ? null : Number(f.height_cm),
      weightKg: f.weight_kg === null ? null : Number(f.weight_kg),
      chestCm: f.chest_cm === null ? null : Number(f.chest_cm),
      waistCm: f.waist_cm === null ? null : Number(f.waist_cm),
      hipCm: f.hip_cm === null ? null : Number(f.hip_cm),
      footLengthCm: f.foot_length_cm === null ? null : Number(f.foot_length_cm),
      footWidthCm: f.foot_width_cm === null ? null : Number(f.foot_width_cm),
      updatedAt: f.updated_at ?? null,
    } : null);
    /**
     * TANDA L-ter — LAS MEDIDAS SON UN JUEGO ÚNICO (petición del dueño: «altura, peso y el número de
     * calzado van juntos, el guardado será juntos»).
     *
     * Antes había dos filas independientes (ropa y calzado) y el asistente guardaba una u otra según
     * la prenda: se podía acabar con la altura guardada y el número sin guardar, o al revés. Para el
     * comprador son SUS medidas, no dos expedientes.
     *
     * Se lee UN juego (la fila `body`; si solo hay `feet` —de antes—, esa) y se devuelve en las dos
     * claves: así nada de lo que ya lo leía se rompe.
     */
    const unica = filas.find((x) => String(x.category) === 'body') ?? filas[0] ?? null;
    const juego = de(unica);
    return { body: juego, feet: juego };
  }"""

A2 = """  async setMeasurements(userId: string, dto: any) {
    const category = String(dto?.category ?? '').trim().toLowerCase();
    if (!['body', 'feet'].includes(category)) {
      throw new DomainError('MEASURE_CATEGORY_INVALID', 'La categoría tiene que ser body o feet');
    }"""

N2 = """  async setMeasurements(userId: string, dto: any) {
    const categoryRaw = String(dto?.category ?? '').trim().toLowerCase();
    /**
     * Sin categoría (o «all»/«todo») = **UN JUEGO ÚNICO**: altura, peso y calzado juntos. Es lo que
     * manda ahora la app. Se sigue aceptando `body`/`feet` por compatibilidad, pero escribir una sola
     * categoría ya no parte las medidas en dos.
     */
    const unico = categoryRaw === '' || categoryRaw === 'all' || categoryRaw === 'todo';
    const category = unico ? 'body' : categoryRaw;
    if (!unico && !['body', 'feet'].includes(category)) {
      throw new DomainError('MEASURE_CATEGORY_INVALID', 'La categoría tiene que ser body, feet o ninguna (un juego único)');
    }"""

A3 = """    if (category === 'body' && chest === null && waist === null && hip === null && height === null && weight === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para la ropa hace falta al menos la altura, el peso, el pecho, la cintura o la cadera');
    }
    if (category === 'feet' && footL === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para el calzado hace falta el largo del pie');
    }"""

N3 = """    if (unico) {
      // Un juego único: basta con UNA medida para guardarlo (altura, peso o calzado).
      if (height === null && weight === null && footL === null && chest === null && waist === null && hip === null) {
        throw new DomainError('MEASURE_REQUIRED', 'Pon al menos tu altura, tu peso o tu número de calzado');
      }
    } else if (category === 'body' && chest === null && waist === null && hip === null && height === null && weight === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para la ropa hace falta al menos la altura, el peso, el pecho, la cintura o la cadera');
    } else if (category === 'feet' && footL === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para el calzado hace falta el largo del pie');
    }"""

A4 = """    await this.db.$executeRaw`
      INSERT INTO lifebook.user_measurements
        (user_id, category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, foot_length_cm, foot_width_cm, updated_at)
      VALUES
        (${userId}::uuid, ${category}, ${gender}, ${height}, ${weight}, ${chest}, ${waist}, ${hip}, ${footL}, ${footW}, now())
      ON CONFLICT (user_id, category) DO UPDATE SET
        gender = ${gender}, height_cm = ${height}, weight_kg = ${weight}, chest_cm = ${chest},
        waist_cm = ${waist}, hip_cm = ${hip}, foot_length_cm = ${footL}, foot_width_cm = ${footW},
        updated_at = now()`;
    return this.myMeasurements(userId);"""

N4 = """    await this.db.$executeRaw`
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

PIEZAS = [(A1, N1), (A2, N2), (A3, N3), (A4, N4)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'JUEGO ÚNICO' in src or 'unico' in src.split('async setMeasurements')[1][:900]:
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
    print('escrito commerce.service.ts (las medidas son un juego único)')
    return 0


sys.exit(main())
