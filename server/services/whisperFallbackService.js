import OpenAI from 'openai';

export class WhisperFallbackService {
  constructor({ apiKey, logger }) {
    this.client = new OpenAI({ apiKey });
    this.logger = logger;
    this.chunks = [];
    this.lastFlush = Date.now();
  }

  addAudioChunk(chunk) {
    this.chunks.push(Buffer.from(chunk));
  }

  shouldFlush(intervalMs = 2200) {
    return Date.now() - this.lastFlush >= intervalMs && this.chunks.length > 0;
  }

  async flushToText() {
    if (!this.chunks.length) return '';

    const webm = Buffer.concat(this.chunks);
    this.chunks = [];
    this.lastFlush = Date.now();

    try {
      const file = new File([webm], 'audio.webm', { type: 'audio/webm' });
      const result = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'text'
      });
      return String(result).trim();
    } catch (error) {
      this.logger.error({ error }, 'Whisper fallback failed');
      return '';
    }
  }
}
