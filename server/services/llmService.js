import OpenAI from 'openai';

export class LLMService {
  constructor({ apiKey }) {
    this.client = new OpenAI({
      apiKey,  // 🔥 use OPENROUTER_API_KEY
      baseURL: "https://openrouter.ai/api/v1",  // 🔥 REQUIRED
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:5173", // optional but recommended
        "X-Title": "Voice AI Assistant"
      }
    });
  }

  /**
   * Streams LLM text for low latency replies.
   */
  async streamReply({ conversation, onToken, signal }) {
    const stream = await this.client.responses.create({
      model: 'openai/gpt-4o-mini', // 🔥 OpenRouter format
      input: conversation.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
      stream: true
    });

    let finalText = '';

    try {
      for await (const event of stream) {
        if (signal?.aborted) {
          await stream.controller.abort();
          break;
        }

        if (event.type === 'response.output_text.delta') {
          finalText += event.delta;
          onToken(event.delta);
        }
      }
    } catch (err) {
      console.error("LLM Stream Error:", err);
      throw err;
    }

    return finalText.trim();
  }
}