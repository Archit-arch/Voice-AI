export class TTSService {
  constructor({ apiKey, voiceId }) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  async #requestElevenLabs({ text, signal, modelId }) {
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        ...(modelId ? { model_id: modelId } : {}),
        text,
        output_format: 'mp3_22050_32'
      }),
      signal
    });
  }

  /**
   * Generates TTS audio and returns a single MP3 payload.
   *
   * Note: ElevenLabs returns an MP3 *stream* (byte chunks). Individual chunks
   * are not reliably decodable as standalone MP3 files in the browser.
   */
  async streamSpeech({ text, signal }) {
    try {
      console.log("🔊 TTS START:", text);

      // Some accounts/models can fail with auth-like errors; fallback to default model selection.
      let response = await this.#requestElevenLabs({ text, signal, modelId: 'eleven_flash_v2_5' });
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        const errText = await response.text();
        console.error("❌ ElevenLabs auth error (flash model):", errText);
        response = await this.#requestElevenLabs({ text, signal, modelId: null });
      }

      // 🔥 Better error logging
      if (!response.ok) {
        const errText = await response.text();
        console.error("❌ ElevenLabs Error:", errText);
        throw new Error(`TTS request failed: ${response.status} ${response.statusText} - ${errText}`);
      }

      if (!response.body) {
        throw new Error("TTS response body missing");
      }

      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("🔴 TTS STREAM DONE");
          break;
        }

        if (signal?.aborted) {
          console.log("⛔ TTS ABORTED");
          break;
        }

        if (value && value.length > 0) {
          console.log("📦 TTS CHUNK SIZE:", value.length);
          chunks.push(Buffer.from(value));
        }
      }

      if (signal?.aborted) return null;
      if (chunks.length === 0) return null;

      const mp3 = Buffer.concat(chunks);
      return mp3.toString('base64');
    } catch (err) {
      console.error("❌ TTS ERROR:", err);
      throw err;
    }
  }
}