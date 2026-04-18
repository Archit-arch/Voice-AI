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

    const conn = this.deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      punctuate: true,
      smart_format: true,
      interim_results: true,
      endpointing: 200
    });

    const handleTranscript = (payload) => {
      const text = payload.channel?.alternatives?.[0]?.transcript?.trim();
      if (!text) return;
      if (payload.is_final) onFinal(text);
      else onPartial(text);
    };

    conn.on(LiveTranscriptionEvents.Open, () => this.logger.info('Deepgram stream opened'));
    conn.on(LiveTranscriptionEvents.Transcript, handleTranscript);
    conn.on(LiveTranscriptionEvents.Error, onError);
    conn.on(LiveTranscriptionEvents.Close, () => this.logger.info('Deepgram stream closed'));

    return conn;
  }
}
