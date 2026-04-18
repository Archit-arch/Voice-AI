import { AccessToken } from 'livekit-server-sdk';
import { Router } from 'express';

export function livekitRouter({ config, logger }) {
  const router = Router();

  router.get('/status', (_req, res) => {
    const enabled = Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret);
    res.json({
      enabled,
      url: config.livekit.url || null,
      roomName: config.livekit.roomName
    });
  });

  router.post('/token', (req, res) => {
    const { identity } = req.body;

    if (!identity) {
      return res.status(400).json({ error: 'identity is required' });
    }

    if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
      logger.warn('LiveKit is not fully configured; returning disabled mode');
      return res.json({
        enabled: false,
        reason:
          'LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required for LiveKit signaling. Running in websocket-only mode.'
      });
    }

    const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, { identity });
    token.addGrant({
      roomJoin: true,
      room: config.livekit.roomName,
      canPublish: true,
      canSubscribe: true
    });

    return res.json({ enabled: true, token: token.toJwt(), url: config.livekit.url });
  });

  return router;
}
