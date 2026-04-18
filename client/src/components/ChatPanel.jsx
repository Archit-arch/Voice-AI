export function ChatPanel({ messages }) {
  return (
    <div className="chat-panel">
      {messages.length === 0 ? (
        <div className="empty">Start speaking to begin the conversation.</div>
      ) : (
        messages.map((message) => (
          <article key={message.id} className={`bubble ${message.role}`}>
            <span className="role">{message.role}</span>
            <p>{message.text}</p>
          </article>
        ))
      )}
    </div>
  );
}
