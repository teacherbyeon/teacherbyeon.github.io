import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import { sessionsRouter } from './routes/sessions.js';
import { questionsRouter } from './routes/questions.js';
import { initSocket } from './sockets/socket.js';
import { startTimerLoop } from './sockets/timerManager.js';

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'server/uploads')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/sessions', sessionsRouter);
app.use('/api/questions', questionsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

initSocket(server);
startTimerLoop();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${config.port}`);
});
