-- El móvil está en Acurenam y la búsqueda de Life Book es por ciudad: el producto de prueba se
-- publicó en Malabo y no salía. Se cambia la ciudad del PRODUCTO DE PRUEBA (tanda K) para poder
-- verlo en el teléfono como comprador.
\pset pager off
UPDATE lifebook.products
   SET origin_city = 'Acurenam'
 WHERE id = '074e141b-f618-47c5-9078-acb74e82d467';

SELECT id, title, origin_city, status,
       (SELECT count(*) FROM lifebook.product_variants v WHERE v.product_id = p.id) AS combinaciones,
       (SELECT count(*) FROM lifebook.product_option_groups g WHERE g.product_id = p.id) AS ejes
  FROM lifebook.products p
 WHERE id = '074e141b-f618-47c5-9078-acb74e82d467';
