const express = require('express');
const client = require("prom-client");
const winston = require("winston");
const LokiTransport = require("winston-loki");

const app = express();
const PORT = process.env.PORT || 3000;

client.collectDefaultMetrics({ register: client.register });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new LokiTransport({
      host: "http://yourip:3100",
      labels: { 
        job: 'express-app',
        service: 'monitoring-app'
      },
      json: true,
      format: winston.format.json()
    })
  ]
});

let requestCount = 0;
let errorCount = 0;

const httpRequestCounter = new client.Counter({
  name: 'app_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'status'],
});

const httpErrorCounter = new client.Counter({
  name: 'app_errors_total',
  help: 'Total number of errors',
});

const healthGauge = new client.Gauge({
  name: 'app_health_status',
  help: 'Application health status',
});

app.use(express.json());

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  const metrics = await client.register.metrics();
  res.send(metrics);
});

app.use((req, res, next) => {
  requestCount++;
  
  logger.info('Request', {
    method: req.method,
    url: req.url,
    ip: req.ip
  });

  res.on('finish', () => {
    httpRequestCounter.inc({
      method: req.method,
      status: res.statusCode,
    });

    if (res.statusCode >= 400) {
      logger.error('Request error', {
        method: req.method,
        url: req.url,
        status: res.statusCode
      });
      errorCount++;
      httpErrorCounter.inc();
    } else {
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        status: res.statusCode
      });
    }
  });

  next();
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Monitoring App</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .status { background: #10b981; color: white; padding: 10px; border-radius: 5px; text-align: center; }
        .btn { background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }
        .btn-danger { background: #ef4444; }
        .metrics { display: flex; gap: 20px; justify-content: center; }
        .metric { text-align: center; background: white; padding: 15px; border-radius: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #4f46e5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>Monitoring App</h1>
            <div class="status">System Healthy</div>
        </div>
        
        <div class="card">
            <h3>Endpoints</h3>
            <a href="/metrics" class="btn">Prometheus Metrics</a>
            <a href="/health" class="btn">Health Check</a>
            <a href="/api/users" class="btn">API Users</a>
            <a href="/api/error" class="btn btn-danger">Test Error</a>
        </div>
        
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${requestCount}</div>
                <div>Requests</div>
            </div>
            <div class="metric">
                <div class="metric-value">${errorCount}</div>
                <div>Errors</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.floor(process.uptime())}s</div>
                <div>Uptime</div>
            </div>
        </div>
    </div>
</body>
</html>`);
});

app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };

  logger.info('Health check', health);
  healthGauge.set(1);
  res.json(health);
});

app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ];
  
  logger.info('Users requested', { count: users.length });
  res.json({ users, count: users.length });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    logger.error('User creation failed', { name: !!name, email: !!email });
    return res.status(400).json({ error: 'Name and email required' });
  }
  
  const user = { id: Date.now(), name, email };
  logger.info('User created', { userId: user.id });
  res.status(201).json({ user });
});

app.get('/api/error', (req, res) => {
  const shouldError = Math.random() > 0.5;
  
  if (shouldError) {
    logger.error('Simulated error', { endpoint: '/api/error' });
    return res.status(500).json({ error: 'Simulated error' });
  }
  
  logger.info('Error test passed');
  res.json({ message: 'No error this time' });
});

app.use((req, res) => {
  logger.warn('404 Not Found', { url: req.url });
  res.status(404).json({ error: 'Not found', path: req.url });
});

setInterval(() => {
  const tasks = ['backup', 'cleanup', 'sync'];
  const task = tasks[Math.floor(Math.random() * tasks.length)];
  
  if (Math.random() > 0.2) {
    logger.info('Background task completed', { task });
  } else {
    logger.error('Background task failed', { task });
  }
}, 30000);
