export function ChatLauncher({ label, onOpen }) {
  return (
    <button
      className="chat-launcher"
      type="button"
      aria-expanded="false"
      aria-controls="chat-panel"
      aria-label={label}
      onClick={onOpen}
    >
      <svg className="chat-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="chat-launcher__label">{label}</span>
    </button>
  );
}
