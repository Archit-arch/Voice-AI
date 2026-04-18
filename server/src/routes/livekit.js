import { AccessToken } from 'livekit-server-sdk';
import { Router } from 'express';

export function livekitRouter({ config }) {
  const router = Router();

  router.post('/token', (req, res) => {
    const { identity } = req.body;

    if (!identity) {
      return res.status(400).json({ error: 'identity is required' });
    }

    const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, { identity });
    token.addGrant({
      roomJoin: true,
      room: config.livekit.roomName,
      canPublish: true,
      canSubscribe: true
    });

    return res.json({ token: token.toJwt(), url: config.livekit.url });
  });

  return router;
}
