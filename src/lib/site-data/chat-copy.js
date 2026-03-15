import chatCopyEntries from '../../content/chat-copy.json' with { type: 'json' };

export const CHAT_COPY = Object.freeze(
	Object.fromEntries(chatCopyEntries.map((entry) => [entry.id, entry])),
);
