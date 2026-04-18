import { useVoiceAgent } from './hooks/useVoiceAgent';
import { ChatPanel } from './components/ChatPanel';
import { VoiceControls } from './components/VoiceControls';

function App() {
  const {
    messages,
    partialTranscript,
    connectionState,
    isListening,
    isAssistantSpeaking,
    latency,
    error,
    startSession,
    stopSession,
    interruptAssistant
  } = useVoiceAgent();

  return (
    <main className="app-shell">
      <section className="card">
        <h1>Realtime Voice AI Assistant</h1>
        <p className="subtitle">
          Pipeline: Mic ➜ LiveKit ➜ STT ➜ GPT ➜ TTS
        </p>

        <VoiceControls
          connectionState={connectionState}
          isListening={isListening}
          isAssistantSpeaking={isAssistantSpeaking}
          onStart={startSession}
          onStop={stopSession}
          onInterrupt={interruptAssistant}
          latency={latency}
        />

        {partialTranscript ? (
          <div className="partial">
            <strong>Listening:</strong> {partialTranscript}
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}

        <ChatPanel messages={messages} />
      </section>
    </main>
  );
}

export default App;
