require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const queryRoutes = require('./routes/query');
const authMiddleware = require('./middleware/auth');
const { closePool, allowedDatabases } = require('./db-connector');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging (simple)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    allowedDatabases: allowedDatabases
  });
});

// API Key authentication for all /api routes
app.use('/api', authMiddleware);

// API routes
app.use('/api/v1', queryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`MSSQL API Gateway started`);
  console.log(`Port: ${PORT}`);
  console.log(`Allowed databases: ${allowedDatabases.join(', ') || 'NONE'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`========================================`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await closePool();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await closePool();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
