// File path: backend/services/ingestionService.js
// Purpose: Takes validated CSV records and writes them into the
// normalized schema (categories, products, customers, regions,
// sales_records) inside a single DB transaction. Lookup tables are
// deduped in memory first and upserted with INSERT IGNORE, then
// sales_records are bulk-inserted in chunks for performance.
//
// Converted from PostgreSQL: `$1, $2...` numbered placeholders -> plain
// `?`; `INSERT ... ON CONFLICT (cols) DO NOTHING` -> `INSERT IGNORE INTO
// ...`, which relies on the same UNIQUE KEY constraints already defined
// in schema.sql (categories.name, regions.name, products' composite
// (name, category_id) key, customers' composite (external_customer_id,
// name) key) to silently skip rows that would violate them.
//
// The `client` parameter here is the object returned by
// config/db.js's getConnection() — it exposes the same `{ rows }`-shaped
// `.query()` used everywhere else in the app, so this file's structure is
// otherwise unchanged from the PostgreSQL version.

const CHUNK_SIZE = 500;

async function upsertLookup(client, table, uniqueRows, columns) {
  // uniqueRows: array of arrays matching `columns` order.
  if (uniqueRows.length === 0) return new Map();

  const columnsSql = columns.join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const valuesSql = uniqueRows.map(() => rowPlaceholder).join(', ');
  const flatParams = uniqueRows.flat();

  await client.query(
    `INSERT IGNORE INTO ${table} (${columnsSql}) VALUES ${valuesSql}`,
    flatParams
  );

  const { rows } = await client.query(`SELECT id, ${columnsSql} FROM ${table}`);
  const map = new Map();
  rows.forEach((row) => {
    const key = columns.map((c) => (row[c] === null ? '' : String(row[c]))).join('||');
    map.set(key, row.id);
  });
  return map;
}

/**
 * Ingests validated records for a given datasetId inside the provided
 * transactional client. Returns { insertedRows }.
 */
async function ingestRecords(client, datasetId, records) {
  if (records.length === 0) return { insertedRows: 0 };

  // ---------- 1. Categories ----------
  const categoryNames = [...new Set(records.map((r) => r.category))];
  const categoryPairs = categoryNames.map((name) => [name]);
  const categoryMap = await upsertLookup(client, 'categories', categoryPairs, ['name']);

  // ---------- 2. Regions ----------
  const regionNames = [...new Set(records.map((r) => r.region))];
  const regionPairs = regionNames.map((name) => [name]);
  const regionMap = await upsertLookup(client, 'regions', regionPairs, ['name']);

  // ---------- 3. Products (name + category_id) ----------
  const productKeySet = new Map(); // key -> [name, categoryId]
  records.forEach((r) => {
    const categoryId = categoryMap.get(r.category);
    const key = `${r.product}||${categoryId}`;
    if (!productKeySet.has(key)) productKeySet.set(key, [r.product, categoryId]);
  });
  const productMap = await upsertLookup(
    client,
    'products',
    [...productKeySet.values()],
    ['name', 'category_id']
  );

  // ---------- 4. Customers (external_customer_id + name) ----------
  const customerKeySet = new Map();
  records.forEach((r) => {
    const key = `${r.customerId || ''}||${r.customerName}`;
    if (!customerKeySet.has(key)) customerKeySet.set(key, [r.customerId, r.customerName]);
  });
  const customerMap = await upsertLookup(
    client,
    'customers',
    [...customerKeySet.values()],
    ['external_customer_id', 'name']
  );

  // ---------- 5. Bulk insert sales_records ----------
  const columns = [
    'dataset_id', 'order_id', 'order_date', 'product_id',
    'customer_id', 'region_id', 'quantity', 'sales', 'profit', 'discount',
  ];

  let insertedRows = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const values = chunk.map((r) => {
      const categoryId = categoryMap.get(r.category);
      const productId = productMap.get(`${r.product}||${categoryId}`);
      const customerId = customerMap.get(`${r.customerId || ''}||${r.customerName}`);
      const regionId = regionMap.get(r.region);
      return [
        datasetId,
        r.orderId,
        r.orderDate.toISOString().slice(0, 10),
        productId || null,
        customerId || null,
        regionId || null,
        r.quantity,
        r.sales,
        r.profit,
        r.discount,
      ];
    });

    const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
    const placeholders = values.map(() => rowPlaceholder).join(', ');
    const flatParams = values.flat();

    await client.query(
      `INSERT INTO sales_records (${columns.join(', ')}) VALUES ${placeholders}`,
      flatParams
    );
    insertedRows += chunk.length;
  }

  return { insertedRows };
}

module.exports = { ingestRecords };
