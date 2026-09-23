update wallet.ecomerse_product_docs set status = ''approved'', reviewed_at = now()
where product_id = ''7a1cbba8-941a-47db-8f8f-e2613ce0c29b'';
select doc_type, status from wallet.ecomerse_product_docs where product_id = ''7a1cbba8-941a-47db-8f8f-e2613ce0c29b'';
