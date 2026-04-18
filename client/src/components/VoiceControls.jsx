export function VoiceControls({
  connectionState,
  isListening,
  isAssistantSpeaking,
  onStart,
  onStop,
  onInterrupt,
  latency
}) {
  return (
    <div className="controls">
      <button onClick={onStart} disabled={connectionState === 'connected'}>
        Start Session
      </button>
      <button onClick={onStop} disabled={connectionState !== 'connected'}>
        Stop Session
      </button>
      <button onClick={onInterrupt} disabled={!isAssistantSpeaking}>
        Interrupt AI
      </button>

      <div className="status-grid">
        <div><strong>Connection:</strong> {connectionState}</div>
        <div><strong>Mic:</strong> {isListening ? 'Live' : 'Muted'}</div>
        <div><strong>Assistant:</strong> {isAssistantSpeaking ? 'Speaking' : 'Idle'}</div>
        <div><strong>E2E Latency:</strong> {latency ? `${latency} ms` : '--'}</div>
      </div>
    </div>
  );
}
