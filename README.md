# Production-Grade Realtime Voice AI Agent

## 1) Architecture Explanation

This project implements a low-latency voice assistant pipeline:

**User speech → LiveKit + WebSocket audio transport → STT → GPT → TTS → streamed audio playback**

### High-level design

- **Client (`/client`)**
  - React + Vite UI with conversation timeline, partial transcript, voice state indicators, and interruption control.
  - Connects to **LiveKit room** for real-time media session and publish/subscribe readiness.
  - Streams mic audio chunks over WebSocket for STT processing while LiveKit handles RTC session control.
  - Plays streamed TTS chunks immediately for lower perceived latency.

- **Server (`/server`)**
  - Node.js + Express API + WebSocket server.
  - Issues LiveKit access tokens.
  - Runs real-time voice pipeline orchestration:
    1. STT stream receives chunks and emits partial/final transcripts.
    2. LLM streams response generation.
    3. TTS streams audio chunks back to browser.
  - Handles interruption (`assistant.interrupt`) with `AbortController`.

- **Services (`/services`)**
  - `sttService.js`: Deepgram streaming STT.
  - `whisperFallbackService.js`: OpenAI Whisper fallback if Deepgram key is unavailable.
  - `llmService.js`: OpenAI GPT streaming.
  - `ttsService.js`: ElevenLabs streaming output.

- **Evals (`/evals`)**
  - `evalLogger.js` writes JSONL records containing:
    - ASR fields (`transcript`, `expected`, `accuracy` placeholder)
    - end-to-end turn latency
    - relevance score heuristic
    - success/failure flag

### Latency strategy (<1.5s target)

- 200ms audio chunks for near-real-time STT updates.
- Streaming STT partials to UI.
- Streaming LLM text generation (token-level accumulation).
- Streaming TTS audio chunks before full synthesis completes.
- Interrupt path aborts in-flight LLM/TTS immediately.

---

## 2) Folder Structure

```text
.
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx
│   │   │   └── VoiceControls.jsx
│   │   ├── hooks/
│   │   │   └── useVoiceAgent.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   └── livekit.js
│   │   ├── config.js
│   │   ├── index.js
│   │   ├── logger.js
│   │   └── voiceSession.js
│   ├── .env.example
│   └── package.json
├── services/
│   ├── llmService.js
│   ├── sttService.js
│   ├── ttsService.js
│   └── whisperFallbackService.js
├── evals/
│   └── evalLogger.js
└── README.md
```

---

## 3) Setup Steps

### Prerequisites

- Node.js 20+
- LiveKit Cloud or self-hosted LiveKit URL/API keys
- OpenAI API key
- Deepgram API key (optional but recommended for low latency)
- ElevenLabs API key

### Install

```bash
cd server && npm install
cd ../client && npm install
```

### Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill real credentials in `server/.env`.

### Run backend

```bash
cd server
npm run dev
```

### Run frontend

```bash
cd client
npm run dev
```

Open `http://localhost:5173`.

### Test voice interaction

1. Click **Start Session**.
2. Speak into mic; partial transcript should appear quickly.
3. After final transcript, assistant text should appear.
4. Audio reply streams and plays in browser.
5. Press **Interrupt AI** while audio is playing to stop immediately.
6. Check `evals/eval_logs.jsonl` for latency/relevance/success metrics.

---

## 4) Engineering Notes

### Error handling and resilience

- WebSocket auto-retry with bounded attempts.
- Explicit error events returned to client UI.
- Safe cleanup for socket/room/media resources on stop/disconnect.

### Modular clean architecture

- Transport layer (Express/WS/LiveKit route) separated from domain services (STT/LLM/TTS).
- Evaluation module isolated under `/evals`.
- Environment-driven configuration under `server/src/config.js`.

### Deploy suggestions

- Deploy frontend on Vercel/Netlify.
- Deploy backend on Fly.io/Render/AWS ECS.
- Use managed LiveKit Cloud for low operational overhead.
- Add Redis for conversation/session state at scale.
- Add OpenTelemetry + centralized logs for production monitoring.

---

## 5) Interview Explanation Script

Use this concise narrative:

> “I built a real-time voice assistant with a streaming speech-to-speech pipeline. The browser publishes mic audio in real time, the backend transcribes with Deepgram (or Whisper fallback), generates contextual replies with GPT, and streams ElevenLabs audio back immediately. I designed it with modular services and interruption support, so users can barge in naturally. I also instrumented JSONL eval logs to track ASR quality placeholders, end-to-end latency, relevance scoring, and success rates. The architecture is production-oriented with clean boundaries, environment-based config, and reconnection/error handling.”

