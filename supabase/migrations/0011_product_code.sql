-- En B&B el campo products.sku pasa a ser el "Código del producto" usado para
-- vincular listas y presupuestos PDF con la base. Ya existe y tiene índice.
-- Dejamos unicidad por usuario según 0001_initial.sql para evitar dos productos
-- con el mismo código dentro de una misma cuenta.
comment on column public.products.sku is 'Código de producto/proveedor usado para búsquedas e importación de PDFs';
