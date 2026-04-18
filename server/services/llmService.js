import OpenAI from 'openai';

export class LLMService {
  constructor({ apiKey }) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Streams GPT text for low latency replies.
   */
  async streamReply({ conversation, onToken, signal }) {
    const stream = await this.client.responses.create({
      model: 'gpt-4.1-mini',
      input: conversation.map((msg) => ({ role: msg.role, content: msg.content })),
      stream: true
    });

    let finalText = '';

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

    return finalText.trim();
  }
}
