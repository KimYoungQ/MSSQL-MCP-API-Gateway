require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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

async function testConnection() {
  console.log('='.repeat(50));
  console.log('MSSQL Connection Test');
  console.log('='.repeat(50));
  console.log('');
  console.log('Configuration:');
  console.log(`  Server: ${config.server}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  User: ${config.user}`);
  console.log(`  Encrypt: ${config.options.encrypt}`);
  console.log(`  Allowed DBs: ${allowedDatabases.join(', ') || 'NONE'}`);
  console.log('');
  console.log('Connecting to MSSQL...');

  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected successfully!');
    console.log('');

    // Test query
    console.log('Running test query: SELECT 1 AS test');
    const result = await pool.request().query('SELECT 1 AS test');
    console.log('✓ Query result:', result.recordset);
    console.log('');

    // List allowed databases only
    console.log('Checking allowed databases...');
    const dbResult = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE state = 0
      ORDER BY name
    `);

    const allDatabases = dbResult.recordset.map(db => db.name.toLowerCase());
    const accessibleDatabases = allowedDatabases.filter(db => allDatabases.includes(db));
    const notFoundDatabases = allowedDatabases.filter(db => !allDatabases.includes(db));

    console.log('');
    console.log('✓ Allowed databases (accessible):');
    if (accessibleDatabases.length > 0) {
      accessibleDatabases.forEach(db => {
        console.log(`  ✓ ${db}`);
      });
    } else {
      console.log('  (none)');
    }

    if (notFoundDatabases.length > 0) {
      console.log('');
      console.log('✗ Allowed databases (NOT FOUND on server):');
      notFoundDatabases.forEach(db => {
        console.log(`  ✗ ${db}`);
      });
    }

    // Test query on first allowed database
    if (accessibleDatabases.length > 0) {
      const testDb = accessibleDatabases[0];
      console.log('');
      console.log(`Testing query on database: ${testDb}`);
      await pool.request().query(`USE [${testDb}]`);
      const tableResult = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
      `);
      console.log(`✓ Tables in ${testDb}: ${tableResult.recordset.length}`);
      tableResult.recordset.slice(0, 5).forEach(t => {
        console.log(`  - ${t.TABLE_NAME}`);
      });
      if (tableResult.recordset.length > 5) {
        console.log(`  ... and ${tableResult.recordset.length - 5} more`);
      }
    }

    await pool.close();
    console.log('');
    console.log('✓ Connection closed.');
    console.log('');
    console.log('='.repeat(50));
    console.log('All tests passed!');
    console.log('='.repeat(50));
  } catch (error) {
    console.log('');
    console.log('✗ Connection failed!');
    console.log('');
    console.log('Error:', error.message);
    console.log('');

    if (error.code === 'ECONNREFUSED') {
      console.log('Hint: Check if MSSQL server is running and accessible');
    } else if (error.message.includes('Login failed')) {
      console.log('Hint: Check DB_USER and DB_PASSWORD in .env');
    } else if (error.message.includes('server was not found')) {
      console.log('Hint: Check DB_SERVER in .env');
    }

    process.exit(1);
  }
}

testConnection();
