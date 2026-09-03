
# B&B Suministros — Corrección Patch Productos

Este ZIP reemplaza el patch anterior de Productos.

## Reemplazar
- app/productos/page.tsx
- components/productos/ProductForm.tsx
- supabase/migrations/0003_products_pricing.sql

## Importante
El error anterior ocurría porque `suggested_price` ya existe como:

`generated always as (...) stored`

Por lo tanto:
- NO se actualiza manualmente.
- NO se inserta desde Next.js.
- Se calcula solo en Supabase al cambiar `cost` o `markup_percent`.

## Pasos
1. Reemplazar los archivos.
2. En Supabase SQL Editor ejecutar el NUEVO:
   `supabase/migrations/0003_products_pricing.sql`
3. Reiniciar:
   `Ctrl + C`
   `npm run dev`
4. Abrir:
   `http://localhost:3000/productos`
