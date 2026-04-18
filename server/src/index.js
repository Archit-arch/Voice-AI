import http from 'node:http';
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { logger } from './logger.js';
import { livekitRouter } from './routes/livekit.js';
import { wireVoiceSocket } from './voiceSession.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/livekit', livekitRouter({ config, logger }));

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: '/ws/voice' });
wireVoiceSocket({ wsServer, config, logger });

server.listen(config.port, () => {
  logger.info(`Voice AI server running on http://localhost:${config.port}`);
});
