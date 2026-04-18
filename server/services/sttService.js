import { LiveTranscriptionEvents, createClient } from '@deepgram/sdk';

export class STTService {
  constructor({ apiKey, logger }) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.deepgram = apiKey ? createClient(apiKey) : null;
  }

  createStreamingSession({ onPartial, onFinal, onError }) {
    if (!this.deepgram) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    // 🔥 Create Deepgram live connection
    const conn = this.deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',

      // ✅ IMPORTANT for browser audio
      encoding: 'linear16',        // 🔥 FIXED (works with MediaRecorder)
      sample_rate: 48000,
      channels: 1,

      interim_results: true,
      punctuate: true,
      smart_format: true,
      endpointing: 200
    });

    // ✅ OPEN
    conn.on(LiveTranscriptionEvents.Open, () => {
      this.logger.info('Deepgram stream opened');
      console.log("✅ DG OPEN");
    });

    // ✅ TRANSCRIPT HANDLING (merged logic)
    conn.on(LiveTranscriptionEvents.Transcript, (data) => {
      console.log("🟡 DG RAW:", JSON.stringify(data));

      const text = data.channel?.alternatives?.[0]?.transcript?.trim();
      if (!text) return;

      if (data.is_final) {
        console.log("🟢 FINAL:", text);
        onFinal(text);
      } else {
        console.log("🔵 PARTIAL:", text);
        onPartial(text);
      }
    });

    // ✅ ERROR
    conn.on(LiveTranscriptionEvents.Error, (err) => {
      console.error("❌ Deepgram Error:", err);
      if (onError) onError(err);
    });

    // ✅ CLOSE
    conn.on(LiveTranscriptionEvents.Close, () => {
      this.logger.info('Deepgram stream closed');
      console.log("🔴 DG CLOSED");
    });

    // ✅ RETURN connection (important)
    return conn;
  }
}