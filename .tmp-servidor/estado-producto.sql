-- Reparación: la prueba dejó «Producto pedidos 224163567» en revisión (editar con PUT vuelve a
-- moderación). Se mira el estado y se deja constancia antes de aprobarlo por la vía normal (API).
SELECT title, status, stock_quantity FROM lifebook.products
 WHERE id = 'd47de72c-bf3e-4701-9535-e85f6f52d74b'::uuid;
