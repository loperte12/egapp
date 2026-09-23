\pset pager off
\echo '=== COLUMNAS DE lifebook.posts ==='
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='lifebook' AND table_name='posts' ORDER BY ordinal_position;

\echo '=== MI NOTA, ENTERA ==='
SELECT * FROM lifebook.posts WHERE id = 'ba846a40-fd50-4719-997e-1b455e1e5f12';
