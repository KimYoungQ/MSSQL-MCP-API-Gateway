const express = require('express');
const router = express.Router();
const { executeQuery, executeStoredProcedure } = require('../db-connector');
const { validateQuery, validateTableName, validateDatabaseName, validateStoredProcedureName } = require('../middleware/validator');

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

/**
 * GET /databases/:database/stored-procedures
 * Get list of stored procedures in a database
 */
router.get('/databases/:database/stored-procedures', async (req, res) => {
  try {
    const { database } = req.params;

    // Validate database name
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const query = `
      SELECT ROUTINE_NAME, CREATED, LAST_ALTERED
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_NAME
    `;

    const procedures = await executeQuery(database, query);
    res.json({
      database,
      procedures: procedures.map(p => ({
        name: p.ROUTINE_NAME,
        created: p.CREATED,
        lastAltered: p.LAST_ALTERED
      })),
      count: procedures.length
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * GET /databases/:database/stored-procedures/:procedure
 * Get detailed information for a stored procedure (definition + parameters)
 */
router.get('/databases/:database/stored-procedures/:procedure', async (req, res) => {
  try {
    const { database, procedure } = req.params;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const procValidation = validateStoredProcedureName(procedure);
    if (!procValidation.valid) {
      return res.status(400).json({ error: procValidation.error });
    }

    // Get procedure info
    const infoQuery = `
      SELECT ROUTINE_NAME, ROUTINE_DEFINITION, CREATED, LAST_ALTERED
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_NAME = '${procedure}' AND ROUTINE_TYPE = 'PROCEDURE'
    `;
    const infoResult = await executeQuery(database, infoQuery);

    if (infoResult.length === 0) {
      return res.status(404).json({ error: `Stored procedure '${procedure}' not found in database '${database}'` });
    }

    // Get parameters
    const paramsQuery = `
      SELECT PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.PARAMETERS
      WHERE SPECIFIC_NAME = '${procedure}'
      ORDER BY ORDINAL_POSITION
    `;
    const paramsResult = await executeQuery(database, paramsQuery);

    const info = infoResult[0];
    res.json({
      database,
      procedure: info.ROUTINE_NAME,
      created: info.CREATED,
      lastAltered: info.LAST_ALTERED,
      definition: info.ROUTINE_DEFINITION,
      parameters: paramsResult.map(p => ({
        name: p.PARAMETER_NAME,
        type: p.DATA_TYPE,
        mode: p.PARAMETER_MODE,
        maxLength: p.CHARACTER_MAXIMUM_LENGTH
      }))
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * GET /databases/:database/stored-procedures/:procedure/definition
 * Get stored procedure definition (source code)
 */
router.get('/databases/:database/stored-procedures/:procedure/definition', async (req, res) => {
  try {
    const { database, procedure } = req.params;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const procValidation = validateStoredProcedureName(procedure);
    if (!procValidation.valid) {
      return res.status(400).json({ error: procValidation.error });
    }

    const query = `
      SELECT ROUTINE_DEFINITION
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_NAME = '${procedure}' AND ROUTINE_TYPE = 'PROCEDURE'
    `;

    const result = await executeQuery(database, query);

    if (result.length === 0) {
      return res.status(404).json({ error: `Stored procedure '${procedure}' not found in database '${database}'` });
    }

    res.json({
      database,
      procedure,
      definition: result[0].ROUTINE_DEFINITION
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * GET /databases/:database/stored-procedures/:procedure/parameters
 * Get stored procedure parameters
 */
router.get('/databases/:database/stored-procedures/:procedure/parameters', async (req, res) => {
  try {
    const { database, procedure } = req.params;

    // Validate inputs
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    const procValidation = validateStoredProcedureName(procedure);
    if (!procValidation.valid) {
      return res.status(400).json({ error: procValidation.error });
    }

    // First check if the procedure exists
    const checkQuery = `
      SELECT ROUTINE_NAME
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_NAME = '${procedure}' AND ROUTINE_TYPE = 'PROCEDURE'
    `;
    const checkResult = await executeQuery(database, checkQuery);

    if (checkResult.length === 0) {
      return res.status(404).json({ error: `Stored procedure '${procedure}' not found in database '${database}'` });
    }

    const query = `
      SELECT PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.PARAMETERS
      WHERE SPECIFIC_NAME = '${procedure}'
      ORDER BY ORDINAL_POSITION
    `;

    const parameters = await executeQuery(database, query);

    res.json({
      database,
      procedure,
      parameters: parameters.map(p => ({
        name: p.PARAMETER_NAME,
        type: p.DATA_TYPE,
        mode: p.PARAMETER_MODE,
        maxLength: p.CHARACTER_MAXIMUM_LENGTH
      })),
      count: parameters.length
    });
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

/**
 * POST /databases/:database/stored-procedures/execute
 * Execute a stored procedure
 */
router.post('/databases/:database/stored-procedures/execute', async (req, res) => {
  try {
    const { database } = req.params;
    const { procedure, parameters = {} } = req.body;

    // Validate database name
    const dbValidation = validateDatabaseName(database);
    if (!dbValidation.valid) {
      return res.status(400).json({ error: dbValidation.error });
    }

    // Validate procedure name
    if (!procedure) {
      return res.status(400).json({ error: 'Stored procedure name is required' });
    }

    const procValidation = validateStoredProcedureName(procedure);
    if (!procValidation.valid) {
      return res.status(400).json({ error: procValidation.error });
    }

    const result = await executeStoredProcedure(database, procedure, parameters);
    res.json(result);
  } catch (error) {
    const statusCode = error.message.includes('not allowed') ? 403 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

module.exports = router;
