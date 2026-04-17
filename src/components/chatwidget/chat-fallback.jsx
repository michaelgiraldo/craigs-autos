export function ChatFallback({
  body,
  detail,
  isDev,
  onRetry,
  retryLabel = 'Try again',
  title,
  variant,
}) {
  const className = variant ? `chat-fallback chat-fallback--${variant}` : 'chat-fallback';

  return (
    <div className={className} role="status">
      {title ? <p className="chat-fallback__title">{title}</p> : null}
      {body ? <p className="chat-fallback__body">{body}</p> : null}
      {onRetry ? (
        <button className="chat-fallback__retry" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
      {isDev && detail ? <p className="chat-fallback__detail">{String(detail)}</p> : null}
    </div>
  );
}
