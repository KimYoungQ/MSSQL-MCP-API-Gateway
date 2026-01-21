const express = require('express');
const router = express.Router();
const { executeQuery } = require('../db-connector');
const { validateQuery, validateTableName, validateDatabaseName } = require('../middleware/validator');

/**
 * GET /databases/:database/tables
 * Get list of tables in a database
 */
router.get('/databases/:database/tables', async (req, res) => {
  try {
    const { database } = req.params;

    // Validate database name
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const query = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;

    const tables = await executeQuery(database, query);
    res.json({
      database,
      tables: tables.map(t => t.TABLE_NAME),
      count: tables.length
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * GET /databases/:database/tables/:table/schema
 * Get schema information for a table
 */
router.get('/databases/:database/tables/:table/schema', async (req, res) => {
  try {
    const { database, table } = req.params;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const tableValidation = validateTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({ error: tableValidation.error });
    }

    const query = `
      SELECT
        COLUMN_NAME as name,
        DATA_TYPE as type,
        CHARACTER_MAXIMUM_LENGTH as maxLength,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `;

    const columns = await executeQuery(database, query);

    if (columns.length === 0) {
      return res.status(404).json({ error: `Table '${table}' not found in database '${database}'` });
    }

    res.json({
      database,
      table,
      columns: columns.map(c => ({
        name: c.name,
        type: c.type,
        maxLength: c.maxLength,
        nullable: c.nullable === 'YES',
        defaultValue: c.defaultValue
      })),
      columnCount: columns.length
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * GET /databases/:database/tables/:table/stats
 * Get statistics for a table
 */
router.get('/databases/:database/tables/:table/stats', async (req, res) => {
  try {
    const { database, table } = req.params;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const tableValidation = validateTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({ error: tableValidation.error });
    }

    // Get row count
    const countQuery = `SELECT COUNT(*) as rowCount FROM [${table}]`;
    const countResult = await executeQuery(database, countQuery);

    // Get column count
    const columnQuery = `
      SELECT COUNT(*) as columnCount
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${table}'
    `;
    const columnResult = await executeQuery(database, columnQuery);

    // Get table size (approximate)
    const sizeQuery = `
      SELECT
        SUM(reserved_page_count) * 8 as sizeKB
      FROM sys.dm_db_partition_stats
      WHERE object_id = OBJECT_ID('${table}')
    `;

    let sizeKB = null;
    try {
      const sizeResult = await executeQuery(database, sizeQuery);
      sizeKB = sizeResult[0]?.sizeKB || null;
    } catch {
      // Size query might fail due to permissions, ignore
    }

    res.json({
      database,
      table,
      rowCount: countResult[0]?.rowCount || 0,
      columnCount: columnResult[0]?.columnCount || 0,
      sizeKB
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * POST /databases/:database/query
 * Execute a SELECT query
 */
router.post('/databases/:database/query', async (req, res) => {
  try {
    const { database } = req.params;
    const { query } = req.body;

    // Validate database name
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    // Validate query
    const queryValidation = validateQuery(query);
    if (!queryValidation.valid) {
      return res.status(400).json({ error: queryValidation.error });
    }

    // Add TOP 1000 limit if not present
    let finalQuery = query;
    if (!query.toUpperCase().includes('TOP ')) {
      finalQuery = query.replace(/SELECT/i, 'SELECT TOP 1000');
    }

    const rows = await executeQuery(database, finalQuery);
    res.json({
      database,
      rows,
      count: rows.length,
      limited: !query.toUpperCase().includes('TOP ')
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * POST /databases/:database/tables/:table/data
 * Get data from a table with optional filtering
 */
router.post('/databases/:database/tables/:table/data', async (req, res) => {
  try {
    const { database, table } = req.params;
    const { limit = 1000, columns = '*' } = req.body;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const tableValidation = validateTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({ error: tableValidation.error });
    }

    // Validate limit
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 1000), 1000);

    // Validate columns (only allow alphanumeric, underscore, comma, space, asterisk)
    let safeColumns = '*';
    if (columns !== '*') {
      const columnPattern = /^[a-zA-Z0-9_,\s*]+$/;
      if (columnPattern.test(columns)) {
        safeColumns = columns;
      }
    }

    const query = `SELECT TOP ${safeLimit} ${safeColumns} FROM [${table}]`;
    const rows = await executeQuery(database, query);

    res.json({
      database,
      table,
      rows,
      count: rows.length,
      limit: safeLimit
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

module.exports = router;
