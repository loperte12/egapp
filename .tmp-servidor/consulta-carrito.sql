\pset pager off
\d lifebook.product_saves
SELECT conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid = 'lifebook.products'::regclass AND contype = 'c';
SELECT DISTINCT status FROM lifebook.products;
