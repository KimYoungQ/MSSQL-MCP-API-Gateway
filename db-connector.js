const sql = require('mssql');

// Database connection configuration
const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    connectTimeout: 15000,
    requestTimeout: 30000
  }
};

// Allowed databases whitelist
const allowedDatabases = process.env.ALLOWED_DATABASES
  ? process.env.ALLOWED_DATABASES.split(',').map(db => db.trim().toLowerCase())
  : [];

let pool = null;

/**
 * Validate if database is in the whitelist
 * @param {string} database - Database name to validate
 * @throws {Error} If database is not allowed
 */
function validateDatabase(database) {
  if (allowedDatabases.length === 0) {
    throw new Error('No databases are configured in the whitelist');
  }

  if (!allowedDatabases.includes(database.toLowerCase())) {
    throw new Error(`Database '${database}' is not allowed. Allowed databases: ${allowedDatabases.join(', ')}`);
  }
}

/**
 * Get or create connection pool
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('Database connection pool created');
  }
  return pool;
}

/**
 * Execute a query on a specific database
 * @param {string} database - Database name
 * @param {string} query - SQL query to execute
 * @returns {Promise<Array>} Query results
 */
async function executeQuery(database, query) {
  // Validate database is in whitelist
  validateDatabase(database);

  const dbPool = await getPool();
  const request = dbPool.request();

  // Switch to the target database
  await request.query(`USE [${database}]`);

  // Execute the query
  const result = await request.query(query);
  return result.recordset;
}

/**
 * Close the connection pool
 */
async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Database connection pool closed');
  }
}

module.exports = {
  getPool,
  executeQuery,
  closePool,
  validateDatabase,
  allowedDatabases
};
