import { v4 as uuidv4 } from 'uuid';
import { STTService } from '../../services/sttService.js';
import { LLMService } from '../../services/llmService.js';
import { TTSService } from '../../services/ttsService.js';
import { WhisperFallbackService } from '../../services/whisperFallbackService.js';
import { EvalLogger } from '../../evals/evalLogger.js';

export function wireVoiceSocket({ wsServer, config, logger }) {
  const stt = new STTService({ apiKey: config.deepgram.apiKey, logger });
  const llm = new LLMService({ apiKey: config.openai.apiKey });
  const tts = new TTSService({ apiKey: config.elevenlabs.apiKey, voiceId: config.elevenlabs.voiceId });
  const evalLogger = new EvalLogger({ logger });

  wsServer.on('connection', (socket) => {
    const sessionId = uuidv4();
    const conversation = [
      {
        role: 'system',
        content:
          'You are a concise, helpful voice assistant. Keep answers to 1-3 sentences unless explicitly asked for detail.'
      }
    ];

    let sttConn;
    let whisperFallback;
    let activeAbortController = null;
    let turnStart = 0;

    const send = (payload) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
    };

    const runAssistantTurn = async (userText) => {
      if (!userText?.trim()) return;

      turnStart = Date.now();
      conversation.push({ role: 'user', content: userText });
      send({ type: 'stt.final', text: userText });

      activeAbortController = new AbortController();
      let streamedText = '';

      try {
        await llm.streamReply({
          conversation,
          signal: activeAbortController.signal,
          onToken: (token) => {
            streamedText += token;
          }
        });

        if (activeAbortController.signal.aborted) return;

        const assistantText = streamedText.trim();
        conversation.push({ role: 'assistant', content: assistantText });
        send({ type: 'assistant.text', text: assistantText });

        await tts.streamSpeech({
          text: assistantText,
          signal: activeAbortController.signal,
          onChunk: (audioBase64) => send({ type: 'assistant.audio.chunk', audioBase64 })
        });

        const latency = Date.now() - turnStart;
        send({ type: 'metrics.latency', ms: latency });

        evalLogger.log({
          sessionId,
          turnLatencyMs: latency,
          asr: { transcript: userText, expected: null, accuracy: null },
          relevanceScore: evalLogger.scoreRelevance({ userText, assistantText }),
          success: true
        });
      } catch (error) {
        logger.error({ error }, 'Voice turn failed');
        send({ type: 'error', message: 'Assistant turn failed. Please retry.' });
        evalLogger.log({
          sessionId,
          turnLatencyMs: Date.now() - turnStart,
          asr: { transcript: userText, expected: null, accuracy: null },
          relevanceScore: 0,
          success: false,
          error: error.message
        });
      } finally {
        activeAbortController = null;
      }
    };

    socket.on('message', async (data, isBinary) => {
      try {
        if (isBinary) {
          if (sttConn) {
            sttConn.send(Buffer.from(data));
          } else if (whisperFallback) {
            whisperFallback.addAudioChunk(data);
            if (whisperFallback.shouldFlush()) {
              const partialText = await whisperFallback.flushToText();
              if (partialText) send({ type: 'stt.partial', text: partialText });
            }
          }
          return;
        }

        const event = JSON.parse(data.toString());

        if (event.type === 'session.start') {
          if (config.deepgram.apiKey) {
            sttConn = stt.createStreamingSession({
              onPartial: (text) => send({ type: 'stt.partial', text }),
              onFinal: async (text) => runAssistantTurn(text),
              onError: (err) => send({ type: 'error', message: `STT error: ${err.message}` })
            });
          } else {
            whisperFallback = new WhisperFallbackService({ apiKey: config.openai.apiKey, logger });
            send({ type: 'error', message: 'Deepgram key missing; using Whisper fallback with higher latency.' });
          }
        }

        if (event.type === 'assistant.interrupt' && activeAbortController) {
          activeAbortController.abort();
        }

        if (event.type === 'stt.flush' && whisperFallback) {
          const finalText = await whisperFallback.flushToText();
          await runAssistantTurn(finalText);
        }

        if (event.type === 'session.stop') {
          if (sttConn) sttConn.finish();
          socket.close();
        }
      } catch (error) {
        logger.error({ error }, 'Socket message handling error');
        send({ type: 'error', message: 'Malformed payload' });
      }
    });

    socket.on('close', () => {
      if (sttConn) sttConn.finish();
      if (activeAbortController) activeAbortController.abort();
    });
  });
}
