// Inspecciona la tabla de favoritos para crear la de seguidos con la MISMA forma. (CommonJS)
const { PrismaClient } = require('D:/egapp/.auditoria-servicios/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const columnas = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='wallet' AND table_name IN ('ecomerse_favorites','ecomerse_sellers')
    ORDER BY table_name, ordinal_position`);
  console.log('=== columnas ===');
  for (const c of columnas) {
    console.log(`  ${c.table_name}.${c.column_name}  ${c.udt_name}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ' DEFAULT ' + c.column_default : ''}`);
  }
  const fks = await prisma.$queryRawUnsafe(`
    SELECT tc.table_name, kcu.column_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='wallet' AND tc.table_name='ecomerse_favorites'`);
  console.log('=== claves ajenas de ecomerse_favorites ===');
  for (const f of fks) console.log(`  ${f.table_name}.${f.column_name} -> ${f.ref_schema}.${f.ref_table}.${f.ref_col}`);
  const idx = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='wallet' AND tablename IN ('ecomerse_favorites','ecomerse_sellers')`);
  console.log('=== indices ===');
  for (const i of idx) console.log(`  ${i.indexname}: ${i.indexdef}`);
  const hay = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='wallet' AND table_name='ecomerse_seller_follows') AS existe`);
  console.log('=== ya existe ecomerse_seller_follows? ===', hay[0].existe);
  await prisma.$disconnect();
})().catch(async (e) => { console.error('ERROR', e.message); await prisma.$disconnect(); process.exit(1); });
