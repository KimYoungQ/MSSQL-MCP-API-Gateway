/**
 * SQL Injection prevention validator
 * Only allows SELECT queries and blocks dangerous keywords/patterns
 */

/**
 * Validate SQL query for safety
 * @param {string} query - SQL query to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required and must be a string' };
  }

  const trimmedQuery = query.trim().toUpperCase();

  // Must start with SELECT
  if (!trimmedQuery.startsWith('SELECT')) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Dangerous keywords that should never appear
  const dangerousKeywords = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'EXEC',
    'EXECUTE',
    'SP_',
    'XP_',
    'TRUNCATE',
    'MERGE',
    'GRANT',
    'REVOKE',
    'DENY'
  ];

  for (const keyword of dangerousKeywords) {
    // Check for keyword as a whole word (surrounded by non-word characters or at boundaries)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(query)) {
      return { valid: false, error: `Dangerous keyword detected: ${keyword}` };
    }
  }

  // Dangerous patterns
  const dangerousPatterns = [
    { pattern: /;\s*SELECT/i, error: 'Stacked queries are not allowed' },
    { pattern: /--/, error: 'SQL comments (--) are not allowed' },
    { pattern: /\/\*/, error: 'Multi-line comments are not allowed' },
    { pattern: /UNION\s+ALL\s+SELECT/i, error: 'UNION ALL injection detected' },
    { pattern: /UNION\s+SELECT/i, error: 'UNION injection detected' },
    { pattern: /INTO\s+OUTFILE/i, error: 'File operations are not allowed' },
    { pattern: /INTO\s+DUMPFILE/i, error: 'File operations are not allowed' },
    { pattern: /LOAD_FILE/i, error: 'File operations are not allowed' }
  ];

  for (const { pattern, error } of dangerousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error };
    }
  }

  return { valid: true };
}

/**
 * Validate table name (alphanumeric and underscore only)
 * @param {string} tableName - Table name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateTableName(tableName) {
  if (!tableName || typeof tableName !== 'string') {
    return { valid: false, error: 'Table name is required' };
  }

  // Allow only alphanumeric characters, underscores, and spaces
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_\s]*$/;
  if (!validPattern.test(tableName)) {
    return { valid: false, error: 'Invalid table name format' };
  }

  return { valid: true };
}

/**
 * Validate database name
 * @param {string} databaseName - Database name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateDatabaseName(databaseName) {
  if (!databaseName || typeof databaseName !== 'string') {
    return { valid: false, error: 'Database name is required' };
  }

  // Allow only alphanumeric characters, underscores, and hyphens
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
  if (!validPattern.test(databaseName)) {
    return { valid: false, error: 'Invalid database name format' };
  }

  return { valid: true };
}

/**
 * Validate stored procedure name
 * SQL Injection prevention - only allows safe characters
 * @param {string} name - Stored procedure name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateStoredProcedureName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Stored procedure name is required' };
  }

  // Allow only alphanumeric characters and underscores (max 128 chars)
  // Must start with letter or underscore
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/;
  if (!validPattern.test(name)) {
    return { valid: false, error: 'Invalid stored procedure name format' };
  }

  return { valid: true };
}

module.exports = {
  validateQuery,
  validateTableName,
  validateDatabaseName,
  validateStoredProcedureName
};
