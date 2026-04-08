import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import collectionsRouter from './routes/collections.js';
import entriesRouter from './routes/entries.js';
import webhooksRouter from './routes/webhooks.js';
import mediaRouter from './routes/media.js';
import usersRouter from './routes/users.js';
import aiRouter from './routes/ai.js';
import aiContentRouter from './routes/ai-content.js';
import dashboardRouter from './routes/dashboard.js';
import activityRouter from './routes/activity.js';
import mediaIntelRouter from './routes/media-intelligence.js';
import redirectsRouter from './routes/redirects.js';
import formsRouter from './routes/forms.js';
import paymentsRouter from './routes/payments.js';
import bookingsRouter from './routes/bookings.js';
import newsletterRouter from './routes/newsletter.js';
import authRouter from './routes/auth.js';
import { validateApiKey, validateJWT, validateAny, configureCors } from './middleware/auth.js';
import { tenantMiddleware, tenantStore } from './middleware/tenant.js';
import { loadTenants, resolveTenant } from './config/tenants.js';
import { startWebhookWorker } from './lib/webhook-worker.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Load tenant configuration (must be before app starts)
loadTenants();

const app: express.Express = express();
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// CORS configuration - MUST BE FIRST, before helmet
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Security middleware (AFTER CORS, disabled in dev)
if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginResourcePolicy: false, // Disable CORP for API
  }));
}

// Stripe webhook needs raw body for signature verification (must be before json parser)
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

// Body parsing (limit increased for base64 media uploads)
app.use(express.json({ limit: '55mb' }));
app.use(express.urlencoded({ extended: true, limit: '55mb' }));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes only
app.use('/api/v1', limiter);

// Tenant resolution — sets up per-request Supabase clients
app.use(tenantMiddleware);

// Stricter rate limit for form submissions (anti-spam)
const formsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 submissions per 15 min per IP
  message: {
    error: {
      message: 'Too many form submissions. Please try again later.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  const ctx = tenantStore.getStore();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'KibanCMS Unified Server',
    version: '1.3.0',
    mode: NODE_ENV,
    tenant: ctx?.tenant?.id || 'default',
  });
});

// Tenant config endpoint — frontend fetches Supabase credentials from here
app.get('/api/v1/config', (req, res) => {
  const ctx = tenantStore.getStore();
  if (!ctx) {
    res.status(500).json({ error: { message: 'No tenant context', status: 500 } });
    return;
  }

  res.json({
    data: {
      supabaseUrl: ctx.tenant.supabaseUrl,
      supabaseAnonKey: ctx.tenant.supabaseAnonKey,
      tenantId: ctx.tenant.id,
    },
    timestamp: new Date().toISOString(),
  });
});

// Auth route — no auth middleware (this IS the auth)
app.use('/api/v1/auth', authRouter);

// API routes
// Collections/Users use JWT (for admin UI) - entries/webhooks/media use API keys (for public API)
app.use('/api/v1/collections', validateJWT, collectionsRouter);
app.use('/api/v1/users', validateJWT, usersRouter);
app.use('/api/v1/entries', validateAny, entriesRouter);
app.use('/api/v1/media', validateAny, mediaRouter);
app.use('/api/v1/webhooks', validateAny, webhooksRouter);
app.use('/api/v1/ai', validateJWT, aiRouter);
app.use('/api/v1/ai', validateJWT, aiContentRouter);
app.use('/api/v1/dashboard', validateJWT, dashboardRouter);
app.use('/api/v1/activity', validateJWT, activityRouter);
app.use('/api/v1/media-intel', validateJWT, mediaIntelRouter);
app.use('/api/v1/forms', formsLimiter, validateApiKey, formsRouter); // API Key + stricter rate limit
app.use('/api/v1/newsletter', formsLimiter, validateApiKey, newsletterRouter); // Same rate limit as forms
app.use('/api/v1/payments/webhook', paymentsRouter); // Stripe webhook — public, verified via signature
app.use('/api/v1/payments', validateApiKey, paymentsRouter); // Payment sessions — API Key auth
app.use('/api/v1/bookings', validateApiKey, bookingsRouter); // Bookings — API Key auth
app.use('/api/v1/redirects', redirectsRouter); // Public — no auth needed

// Serve Admin UI (static files from admin build)
if (NODE_ENV === 'production') {
  // In Docker: __dirname = /app/apps/api/dist → admin is at /app/apps/admin/dist
  // In local prod: __dirname = apps/api/dist → admin is at apps/admin/dist
  const adminBuildPath = path.join(__dirname, '../../admin/dist');

  // Serve static files
  app.use(express.static(adminBuildPath));

  // SPA fallback - serve index.html for all other routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        error: {
          message: 'API endpoint not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.sendFile(path.join(adminBuildPath, 'index.html'));
  });
} else {
  // Development mode - just handle 404 for non-API routes
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        error: {
          message: 'API endpoint not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.status(404).send(`
      <html>
        <body>
          <h1>KibanCMS Unified Server - Development Mode</h1>
          <p>Admin UI is not served in development. Run it separately:</p>
          <code>cd apps/admin && pnpm dev</code>
          <hr>
          <h2>API Endpoints:</h2>
          <ul>
            <li><a href="/health">/health</a> - Health check</li>
            <li>/api/v1/collections - List collections</li>
            <li>/api/v1/entries/:collection - List entries</li>
          </ul>
        </body>
      </html>
    `);
  });
}

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      message: err.message || 'Internal server error',
      status: 500,
      timestamp: new Date().toISOString(),
    },
  });
});

// Start webhook worker
const stopWebhookWorker = startWebhookWorker();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopWebhookWorker();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopWebhookWorker();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 KibanCMS Unified Server                             ║
║                                                           ║
║   Status:  RUNNING                                       ║
║   Port:    ${PORT.toString().padEnd(44)}║
║   Mode:    ${NODE_ENV.padEnd(44)}║
║   Health:  http://localhost:${PORT}/health${' '.repeat(26)}║
║                                                           ║
${NODE_ENV === 'production' ?
`║   Admin UI: http://localhost:${PORT}${' '.repeat(30)}║
║                                                           ║` :
`║   Admin UI: Run separately (dev mode)                    ║
║             cd apps/admin && pnpm dev                    ║
║                                                           ║`}
║   API Endpoints:                                         ║
║   • CRUD   /api/v1/collections                           ║
║   • CRUD   /api/v1/entries/:collection                   ║
║   • CRUD   /api/v1/media                                 ║
║   • CRUD   /api/v1/users                                 ║
║   • CRUD   /api/v1/webhooks                              ║
║                                                           ║
║   🔄 Webhook Worker: ACTIVE                              ║
║                                                           ║
║   Documentation: FRONTEND_INTEGRATION_GUIDE.md           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
