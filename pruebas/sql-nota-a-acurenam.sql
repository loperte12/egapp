-- La búsqueda de Life Book es por ciudad y el móvil está en Acurenam: la nota de prueba se publicó
-- en Malabo y no salía. Se pasa a Acurenam para poder abrirla en el teléfono (tanda K).
\pset pager off
UPDATE lifebook.posts SET city = 'Acurenam'
 WHERE id IN ('979c8e77-6982-4926-a4f6-88c3c90a6209', 'ba846a40-fd50-4719-997e-1b455e1e5f12');

SELECT id, left(title, 40) AS titulo, city,
       (SELECT count(*) FROM jsonb_array_elements(p.media_ids)) AS fotos
  FROM lifebook.posts
 WHERE id IN ('979c8e77-6982-4926-a4f6-88c3c90a6209', 'ba846a40-fd50-4719-997e-1b455e1e5f12');
