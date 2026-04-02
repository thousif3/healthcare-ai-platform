/**
 * Healthcare AI Platform — Express Server (Phase 1)
 * ─────────────────────────────────────────────────
 * Responsibilities:
 *  1. Load environment variables
 *  2. Establish and expose a PostgreSQL connection pool (pg.Pool)
 *  3. Configure middleware (security, CORS, logging, body parsing)
 *  4. Mount API route stubs (patients, appointments, health-check)
 *  5. Global error handling
 *  6. Graceful shutdown on SIGTERM / SIGINT
 */

'use strict';

// ─── 1. Environment ────────────────────────────────────────────────────────────
require('dotenv').config();

// ─── 2. Core Imports ───────────────────────────────────────────────────────────
const express   = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const winston   = require('winston');
const { v4: uuidv4 } = require('uuid');

// ─── 3. Logger Setup (Winston) ─────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) =>
            `${timestamp} [${level}]: ${stack || message}`
          )
        )
  ),
  transports: [
    new winston.transports.Console(),
    // Add file transport in production:
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// ─── 4. PostgreSQL Connection Pool ─────────────────────────────────────────────
/**
 * The pool is created once at startup and reused across all requests.
 * Configuration is driven entirely by environment variables so the same
 * code runs in dev, staging, and production without changes.
 */
const pool = new Pool({
  host:               process.env.PGHOST     || 'localhost',
  port:               parseInt(process.env.PGPORT || '5432', 10),
  database:           process.env.PGDATABASE || 'healthcare_ai',
  user:               process.env.PGUSER     || 'postgres',
  password:           process.env.PGPASSWORD,

  // Pool settings — tune based on load testing results
  max:                parseInt(process.env.PG_POOL_MAX                 || '10',   10),
  idleTimeoutMillis:  parseInt(process.env.PG_POOL_IDLE_TIMEOUT_MS    || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_POOL_CONNECTION_TIMEOUT_MS || '2000', 10),

  // SSL in production (set PGSSLMODE=require in your prod environment)
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

// Log pool-level errors (e.g. idle client errors) to avoid unhandled rejections
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Verify database connectivity at startup.
 * The server will exit with a non-zero code if the DB is unreachable.
 */
async function connectDatabase() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT NOW() AS db_time, version() AS pg_version');
    logger.info('PostgreSQL connected', {
      db_time:    rows[0].db_time,
      pg_version: rows[0].pg_version.split(',')[0],
    });
  } finally {
    client.release();
  }
}

// ─── 5. Express Application ────────────────────────────────────────────────────
const app = express();

// ── 5a. Security Middleware ───────────────────────────────────────────────────
app.use(helmet());  // Sets security-relevant HTTP headers (CSP, HSTS, etc.)

// ── 5b. CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server (no origin) and whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request', { origin });
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders:   ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders:   ['X-Request-Id'],
    credentials:      true,
    optionsSuccessStatus: 204,
  })
);

// ── 5c. Body Parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── 5d. Request ID & HTTP Logging ─────────────────────────────────────────────
/** Attach a unique ID to every request for distributed tracing */
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  next();
});

/** Morgan HTTP request logger — writes through Winston */
morgan.token('id', (req) => req.id);
app.use(
  morgan(':id :method :url :status :res[content-length] - :response-time ms', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// ── 5e. Attach DB pool to every request (dependency injection via req.db) ─────
app.use((req, _res, next) => {
  req.db = pool;
  next();
});

// ─── 6. API Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Returns server status and a live database connectivity check.
 * Used by load balancers and monitoring tools.
 */
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT NOW() AS db_time');
    res.json({
      status:    'ok',
      server:    'Healthcare AI Platform API',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      database:  { connected: true, db_time: rows[0].db_time },
    });
  } catch (err) {
    logger.error('Health check DB query failed', { error: err.message });
    res.status(503).json({
      status:   'degraded',
      database: { connected: false, error: err.message },
    });
  }
});

// ── 6a. Patients Routes ───────────────────────────────────────────────────────
/**
 * Route stubs — expand these into full controllers in Phase 2.
 * RBAC enforcement (e.g. JWT + role check middleware) added in Phase 2.
 */

/** GET /api/patients — List patients (paginated) */
app.get('/api/patients', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);

    const { rows, rowCount } = await req.db.query(
      `SELECT
         patient_id, first_name, last_name, date_of_birth,
         gender, email, phone, insurance_provider,
         previous_no_shows, previous_visits,
         is_active, created_at
       FROM patients
       WHERE is_active = TRUE
       ORDER BY last_name, first_name
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ total: rowCount, limit, offset, data: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/patients/:id — Retrieve a single patient */
app.get('/api/patients/:id', async (req, res, next) => {
  try {
    const { rows } = await req.db.query(
      'SELECT * FROM patients WHERE patient_id = $1 AND is_active = TRUE',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** POST /api/patients — Create a new patient record */
app.post('/api/patients', async (req, res, next) => {
  try {
    const {
      first_name, last_name, date_of_birth, gender, ethnicity,
      email, phone, preferred_contact,
      address_line1, address_line2, city, state, zip_code,
      insurance_provider, insurance_id,
      chronic_conditions, has_transportation, distance_to_clinic,
    } = req.body;

    // Basic required-field validation (full validation with express-validator in Phase 2)
    if (!first_name || !last_name || !date_of_birth) {
      return res.status(400).json({
        error: 'first_name, last_name, and date_of_birth are required',
      });
    }

    const { rows } = await req.db.query(
      `INSERT INTO patients (
         first_name, last_name, date_of_birth, gender, ethnicity,
         email, phone, preferred_contact,
         address_line1, address_line2, city, state, zip_code,
         insurance_provider, insurance_id,
         chronic_conditions, has_transportation, distance_to_clinic
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,$12,$13,
         $14,$15,
         $16,$17,$18
       )
       RETURNING *`,
      [
        first_name, last_name, date_of_birth, gender || null, ethnicity || null,
        email || null, phone || null, preferred_contact || 'email',
        address_line1 || null, address_line2 || null, city || null,
        state || null, zip_code || null,
        insurance_provider || null, insurance_id || null,
        chronic_conditions || [], has_transportation ?? true, distance_to_clinic || null,
      ]
    );

    logger.info('Patient created', { patient_id: rows[0].patient_id });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── 6b. Appointments Routes ───────────────────────────────────────────────────

/** GET /api/appointments — List appointments with optional filters */
app.get('/api/appointments', async (req, res, next) => {
  try {
    const { patient_id, provider_id, status, risk_tier, limit = '20', offset = '0' } = req.query;
    const params  = [];
    const filters = [];

    if (patient_id)  { params.push(patient_id);  filters.push(`a.patient_id  = $${params.length}`); }
    if (provider_id) { params.push(provider_id); filters.push(`a.provider_id = $${params.length}`); }
    if (status)      { params.push(status);      filters.push(`a.status      = $${params.length}`); }
    if (risk_tier)   { params.push(risk_tier);   filters.push(`a.risk_tier   = $${params.length}`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    params.push(Math.min(parseInt(limit, 10), 100));
    params.push(parseInt(offset, 10));

    const { rows, rowCount } = await req.db.query(
      `SELECT
         a.appointment_id, a.patient_id,
         p.first_name, p.last_name,
         a.provider_id, a.scheduled_at, a.duration_minutes,
         a.appointment_type, a.department, a.location,
         a.status, a.risk_tier, a.no_show_probability,
         a.scored_at, a.model_version,
         a.reminder_sent, a.created_at
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       ${where}
       ORDER BY a.scheduled_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total: rowCount, data: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/appointments/:id — Retrieve a single appointment */
app.get('/api/appointments/:id', async (req, res, next) => {
  try {
    const { rows } = await req.db.query(
      `SELECT a.*, p.first_name, p.last_name, p.phone, p.email
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.appointment_id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** POST /api/appointments — Schedule a new appointment */
app.post('/api/appointments', async (req, res, next) => {
  try {
    const {
      patient_id, provider_id, scheduled_at,
      duration_minutes, appointment_type, department, location,
    } = req.body;

    if (!patient_id || !provider_id || !scheduled_at || !appointment_type) {
      return res.status(400).json({
        error: 'patient_id, provider_id, scheduled_at, and appointment_type are required',
      });
    }

    const { rows } = await req.db.query(
      `INSERT INTO appointments (
         patient_id, provider_id, scheduled_at,
         duration_minutes, appointment_type, department, location
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        patient_id, provider_id, scheduled_at,
        duration_minutes || 30, appointment_type,
        department || null, location || null,
      ]
    );

    logger.info('Appointment scheduled', {
      appointment_id: rows[0].appointment_id,
      patient_id,
      scheduled_at,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/appointments/:id/score
 * Endpoint reserved for the AI microservice (app_ai_svc role in Phase 2).
 * Updates the no_show_probability score produced by the ML model.
 */
app.patch('/api/appointments/:id/score', async (req, res, next) => {
  try {
    const { no_show_probability, model_version } = req.body;

    if (
      no_show_probability === undefined ||
      no_show_probability < 0 ||
      no_show_probability > 1
    ) {
      return res.status(400).json({
        error: 'no_show_probability must be a float between 0 and 1',
      });
    }

    const { rows } = await req.db.query(
      `UPDATE appointments
       SET no_show_probability = $1,
           scored_at           = NOW(),
           model_version       = $2
       WHERE appointment_id = $3
       RETURNING appointment_id, no_show_probability, risk_tier, scored_at, model_version`,
      [no_show_probability, model_version || 'v1.0.0', req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    logger.info('No-show score updated', {
      appointment_id:     rows[0].appointment_id,
      no_show_probability: rows[0].no_show_probability,
      risk_tier:           rows[0].risk_tier,
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── 7. 404 Catch-All ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error:   'Not Found',
    message: `No route found for ${req.method} ${req.originalUrl}`,
  });
});

// ─── 8. Global Error Handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;

  logger.error('Unhandled error', {
    request_id:  req.id,
    method:      req.method,
    url:         req.originalUrl,
    status_code: statusCode,
    message:     err.message,
    stack:       process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    error:      statusCode >= 500 ? 'Internal Server Error' : err.message,
    request_id: req.id,
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
});

// ─── 9. Server Bootstrap ───────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);

async function bootstrap() {
  try {
    // Verify DB connection before accepting traffic
    await connectDatabase();

    const server = app.listen(PORT, () => {
      logger.info(`Healthcare AI API listening on port ${PORT}`, {
        env:  process.env.NODE_ENV || 'development',
        port: PORT,
      });
    });

    // ── Graceful Shutdown ──────────────────────────────────────────────────────
    /**
     * On SIGTERM (Docker/Kubernetes stop) or SIGINT (Ctrl-C):
     *  1. Stop accepting new connections.
     *  2. Wait for in-flight requests to complete (30 s timeout).
     *  3. Drain the DB pool.
     *  4. Exit cleanly.
     */
    const shutdown = (signal) => async () => {
      logger.info(`${signal} received — starting graceful shutdown…`);

      server.close(async () => {
        logger.info('HTTP server closed — draining DB pool…');
        await pool.end();
        logger.info('Database pool drained. Goodbye.');
        process.exit(0);
      });

      // Force exit after 30 s if shutdown hangs
      setTimeout(() => {
        logger.error('Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 30_000);
    };

    process.on('SIGTERM', shutdown('SIGTERM'));
    process.on('SIGINT',  shutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

bootstrap();

// Export app for testing (Jest + Supertest)
module.exports = { app, pool };
