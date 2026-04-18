import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8080),
  livekit: {
    url: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    roomName: process.env.LIVEKIT_ROOM || 'voice-ai-room'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
  }
};
