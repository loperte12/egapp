/**
 * publish/StepType.tsx — paso 1: TIPO y CATEGORÍA (Parte 34 · tanda K).
 *
 * · Los tipos y sus etiquetas salen del catálogo compartido (`LB_SERVICE_TYPES`),
 *   no de una lista escrita a mano: una sola fuente con el catálogo y la ficha.
 * · Incluye la **categoría** (que el asistente del dueño no recogía en ningún
 *   paso y sin la cual el producto no sale en los filtros ni puede sugerir los
 *   atributos de su categoría).
 *
 * TANDA K — LA CATEGORÍA SE ELIGE EN DOS NIVELES.
 *
 * Antes esto pintaba **las hijas de la primera rama del tipo** y nada más: medido en el Poco F5, un
 * producto físico solo dejaba elegir entre las hijas de «Abacería» (Arroz y granos, Aceite…), así que
 * «Ropa mujer», «Calzado» o «Teléfonos y tablets» eran **inalcanzables**… y sin esa categoría el
 * comerciante tampoco veía los ejes sugeridos (talla, color, almacenamiento). Ahora se elige primero
 * la rama y después la subcategoría (y una rama sin hijas se puede elegir ella misma).
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { LB_SERVICE_TYPES } from '../../../constants/commerce';
import { usePublishStore } from '../../../state/commercePublish';
import type { LbCategory } from '../../../api/commerce';
import { Chip, ChipRow } from '../Chip';
import { Notice, StepBlock, raizYCategoria } from './PublishParts';

export default function StepType({ categories }: { categories: LbCategory[] }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const setForm = usePublishStore((s) => s.setForm);
  /** La rama que se está mirando (por defecto, la de la categoría ya elegida). */
  const [ramaId, setRamaId] = useState<string | null>(null);

  const { raices, raiz, sub } = raizYCategoria(categories, form.serviceType, form.categoryId);
  const rama = raices.find((r) => r.id === ramaId) ?? raiz;
  const hijas = rama?.children ?? [];
  const tipo = LB_SERVICE_TYPES.find((t) => t.id === form.serviceType);

  return (
    <View>
      <StepBlock title="¿Qué quieres publicar?" hint="Los campos del formulario se adaptan al tipo que elijas.">
        <ChipRow>
          {LB_SERVICE_TYPES.map((t) => (
            <Chip
              key={t.id}
              label={`${t.icon} ${t.label}`}
              active={form.serviceType === t.id}
              onPress={() => { setForm({ serviceType: t.id, categoryId: null }); setRamaId(null); }}
            />
          ))}
        </ChipRow>
        {tipo ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>{tipo.hint}</Text>
        ) : null}
      </StepBlock>

      {raices.length > 0 ? (
        <StepBlock
          title="Categoría"
          hint="Sirve para que te encuentren en los filtros y para sugerirte los detalles y las opciones típicas de lo que vendes (tallas, colores…)."
        >
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: espaciado.e6 }}>
            1 · ¿De qué es?
          </Text>
          <ChipRow>
            {raices.map((r) => (
              <Chip
                key={r.id}
                label={`${r.icon ?? ''} ${r.name}`.trim()}
                active={rama?.id === r.id}
                onPress={() => {
                  setRamaId(r.id);
                  // Una rama sin subcategorías se puede elegir ella misma.
                  setForm({ categoryId: (r.children ?? []).length ? null : r.id });
                }}
              />
            ))}
          </ChipRow>

          {hijas.length > 0 ? (
            <View style={{ marginTop: espaciado.e12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: espaciado.e6 }}>
                2 · ¿Cuál? {rama ? `(${rama.name})` : ''}
              </Text>
              <ChipRow>
                {hijas.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.icon ?? ''} ${c.name}`.trim()}
                    active={form.categoryId === c.id}
                    onPress={() => setForm({ categoryId: form.categoryId === c.id ? null : c.id })}
                  />
                ))}
              </ChipRow>
              {sub ? (
                <Text style={{ color: colors.success, fontSize: tipografia.caption, fontWeight: '700', marginTop: espaciado.e6 }}>
                  Elegida: {sub.name}
                </Text>
              ) : null}
            </View>
          ) : null}
        </StepBlock>
      ) : null}

      {!form.categoryId && hijas.length > 0 ? (
        <Notice>Sin categoría tu publicación no aparecerá al filtrar por categoría. Se recomienda elegir una.</Notice>
      ) : null}
    </View>
  );
}
