export class TTSService {
  constructor({ apiKey, voiceId }) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  /**
   * Generates TTS audio and streams small chunks back to client.
   */
  async streamSpeech({ text, onChunk, signal }) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model_id: 'eleven_flash_v2_5',
          text,
          output_format: 'mp3_22050_32'
        }),
        signal
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`TTS request failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;
      onChunk(Buffer.from(value).toString('base64'));
    }
  }
}
