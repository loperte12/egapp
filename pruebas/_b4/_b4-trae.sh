#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# B-4 / B-5 · VENTANA DE **SOLO LECTURA** — cierra B: el censo arreglado y los 16.
#
# NO ESCRIBE NADA QUE IMPORTE:
#   - no toca la base: SOLO SELECT (ningun INSERT/UPDATE/ALTER/DROP/CREATE)
#   - no toca /opt/mirror: solo LEE (find, sha256sum, base64)
#   - lo unico que crea es /tmp/b4-lista.txt (en el HOST) y lo borra al final
# Si este guion falla a la mitad, el dano es CERO. Por eso puede ir en una ventana.
#
# LO QUE SE LLEVA, Y POR QUE:
#   0) si el servidor sigue siendo el del A-4 (las 3 huellas de partida)  -> no versionar sobre otro
#   1) el CENSO de ejemplos, ARREGLADO: filas y coincidencias de las 20 tablas base
#      de los 5 esquemas, sin saber los nombres de las columnas            -> B-5
#   2) los NOMBRES que cuadran en lifebook.shops (para verlos, no creerlos)
#   3) el DICCIONARIO de columnas de las 4 tablas que hay que purgar       -> habilita el seed + la purga
#   4) los 16 ficheros de codigo que faltan, en base64                     -> B-4
#
# EL CENSO NO SABE LOS NOMBRES DE LAS COLUMNAS, Y ESO ES EL ARREGLO.
# La consulta que murio el 27-sep daba por hecho que las CINCO tablas tenian una
# columna `name`, y `lifebook.products` no la tiene: el UNION fallo entero y dejo
# CERO recuentos, que se leen como «no hay ejemplos». La consulta de aqui no nombra
# ni una columna: hace `to_jsonb(q)::text` de la fila entera y busca el patron.
#
# LAS FRONTERAS DE PALABRA (\m ... \M) NO SON DECORACION.
# Sin ellas, `E2E` cuenta como acierto DENTRO de un uuid: E y 2 son hexadecimales,
# asi que `...-e2e5-...` dispara el patron y el censo se infla solo. Con \m\M el
# patron tiene que empezar y acabar en un limite de palabra, y ahi un uuid no cabe.
#
# EL PAYLOAD VA EL ULTIMO, Y NO ES CAPRICHO.
# En la ventana anterior, el error de una consulta (stderr de psql, sin buffer) se
# colo DENTRO del base64 de otra seccion (stdout, en bloque) y partio una linea en
# dos: el extractor lo rechazo, que es lo correcto, pero costo explicarlo. Con el
# payload al final, los errores ya han salido antes de que empiece.
#
# BYTE-EXACTO: los ficheros viajan en base64 con su sha256 y su numero de bytes al
# lado. El extractor comprueba las dos cosas, y el de los 6 que YA estan versionados
# se COMPRUEBA en vez de escribirse: asi el repo queda demostrado igual al servidor.
# ═══════════════════════════════════════════════════════════════════════════════
set -o pipefail

PSQL="docker exec -i mirror-postgres psql -U postgres -d egrouteplan -X -q"
APPDIR=/opt/mirror/app
DIR=$APPDIR/src/lifebook
LISTA=/tmp/b4-lista.txt

# Las tres que YA estan versionadas en el repo (huellas del A-4). Se comprueba que el
# servidor las tenga EXACTAMENTE asi: si no, el servidor no es el que se parcheo y hay
# que saberlo ANTES de versionar nada encima.
HOTEL_SVC=5b929c0708c39fb9ab2a201ac02b1b47b63c139a9bbae3867be16a31ff253099
RESER_SVC=a601d0fa600c38f4c5a18bf008d8c095a04a77a97e5ad8d8c8a3a2892b16b993
MERCH_SVC=826c91c54be0265a2f8d5270f8f5d2a4341773baf9c476760953727f115a3a4d

CORTA='(E2E|PRUEBA|TEST|DEMO|EJEMPLO|CUOTA|DUMMY|FAKE|SANDBOX)'

echo "######################################################################"
echo "### B-4/B-5 · VENTANA DE SOLO LECTURA · censo + los 16 ficheros"
echo "######################################################################"
date -Is
echo "host: $(hostname)"
echo

echo "=== 0) ¿el servidor sigue siendo el del A-4? (3 huellas de partida) ==="
H1=$(sha256sum "$DIR/hotel.service.ts" | cut -d' ' -f1)
H2=$(sha256sum "$DIR/reservations.service.ts" | cut -d' ' -f1)
H3=$(sha256sum "$DIR/hotel-merchant.service.ts" | cut -d' ' -f1)
if [ "$H1" = "$HOTEL_SVC" ]; then R1=CUADRA; else R1='*** NO CUADRA ***'; fi
if [ "$H2" = "$RESER_SVC" ]; then R2=CUADRA; else R2='*** NO CUADRA ***'; fi
if [ "$H3" = "$MERCH_SVC" ]; then R3=CUADRA; else R3='*** NO CUADRA ***'; fi
printf '  %-28s %s  %s\n' 'hotel.service.ts'          "$(echo "$H1" | cut -c1-16)" "$R1"
printf '  %-28s %s  %s\n' 'reservations.service.ts'   "$(echo "$H2" | cut -c1-16)" "$R2"
printf '  %-28s %s  %s\n' 'hotel-merchant.service.ts' "$(echo "$H3" | cut -c1-16)" "$R3"

echo
echo "=== 1) el CENSO de ejemplos: filas y coincidencias, TODAS las tablas base ==="
echo "    (sin nombrar ni una columna: to_jsonb de la fila entera + \m..\M)"
$PSQL -c "
SELECT n.nspname AS esquema,
       c.relname AS tabla,
       COALESCE((xpath('//row/r/text()', x))[1]::text::bigint, -1) AS filas,
       COALESCE((xpath('//row/p/text()', x))[1]::text::bigint, -1) AS parecen_prueba
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL (
    SELECT query_to_xml(
      format('SELECT count(*) AS r, count(*) FILTER (WHERE to_jsonb(q)::text ~* %L) AS p FROM %I.%I q',
             '\m${CORTA}\M', n.nspname, c.relname),
      false, true, '') AS x
  ) qx
 WHERE c.relkind = 'r'
   AND n.nspname IN ('lifebook','wallet','mobility','ecomerse','public')
 ORDER BY 4 DESC, 1, 2;"

echo
echo "=== 2) los NOMBRES que cuadran en lifebook.shops (para verlos, no creerlos) ==="
$PSQL -c "
SELECT id, name, city, created_at::date AS creada
  FROM lifebook.shops
 WHERE name ~* '\m${CORTA}\M'
 ORDER BY created_at;"

echo
echo "=== 3) el DICCIONARIO de columnas de las tablas que hay que purgar ==="
echo "    (esto es lo que hace falta para escribir el seed y la purga)"
$PSQL -c "
SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna,
       data_type AS tipo, is_nullable AS nulo, column_default AS por_defecto
  FROM information_schema.columns
 WHERE (table_schema, table_name) IN (
         ('lifebook','shops'), ('lifebook','products'), ('mobility','users'),
         ('wallet','ecomerse_products'), ('lifebook','hotel_profiles'))
 ORDER BY 1, 2, ordinal_position;"

echo
echo "=== 4) los ficheros de codigo de src/lifebook (EL PAYLOAD VA AL FINAL) ==="
cd "$DIR" || exit 4
find . -type f -name '*.ts' -not -name '*.bak*' | sed 's|^\./||' | sort > "$LISTA"
echo "  ficheros .ts de codigo (sin .bak): $(wc -l < "$LISTA")"
echo

while read -r rel; do
  [ -z "$rel" ] && continue
  h=$(sha256sum "$rel" | cut -d' ' -f1)
  nb=$(wc -c < "$rel")
  case "$rel" in
    hotel.service.ts|reservations.service.ts|hotel-merchant.service.ts|hotel.controller.ts|hotel-merchant.controller.ts|dto/hotel-reservation.dto.ts)
      # Ya esta en el repo: NO se re-manda. Se declara para que el extractor lo compruebe.
      printf '@TENGO %s %s %s\n' "$rel" "$h" "$nb"
      ;;
    *)
      printf '@INICIO %s %s %s\n' "$rel" "$h" "$nb"
      base64 -w0 "$rel"
      printf '\n@FIN\n'
      ;;
  esac
done < "$LISTA"

rm -f "$LISTA"
echo
echo "=== FIN · SOLO LECTURA · no se ha escrito nada en la base ni en /opt/mirror ==="
