\pset pager off
SELECT count(*) AS posts_activos,
       count(*) FILTER (WHERE payload ? 'lat' AND payload ? 'lng') AS con_coordenadas,
       count(*) FILTER (WHERE payload ->> 'placeName' IS NOT NULL) AS con_nombre_de_sitio,
       count(*) FILTER (WHERE barrio IS NOT NULL AND barrio <> '') AS con_barrio
  FROM lifebook.posts
 WHERE state = 'active';

SELECT id, type, city, barrio,
       payload ->> 'lat' AS lat, payload ->> 'lng' AS lng,
       payload ->> 'placeName' AS sitio, payload ->> 'label' AS etiqueta
  FROM lifebook.posts
 WHERE state = 'active' AND payload ? 'lat'
 ORDER BY created_at DESC LIMIT 5;

SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'posts'
 ORDER BY ordinal_position;
