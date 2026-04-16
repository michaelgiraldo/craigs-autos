import React from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';

export class ChatKitErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset() {
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render() {
    const { error } = this.state;
    if (error) return this.props.fallback?.(error, this.reset) ?? null;
    return this.props.children;
  }
}

export function ChatKitWithHooks({
  options,
  onReady,
  onError,
  onLog,
  onThreadChange,
  onResponseStart,
  onResponseEnd,
  onChat,
}) {
  const chat = useChatKit({
    ...options,
    onReady,
    onError,
    onLog,
    onThreadChange,
    onResponseStart,
    onResponseEnd,
  });

  React.useEffect(() => {
    onChat?.(chat);
  }, [chat, onChat]);

  return <ChatKit control={chat.control} className="chat-frame" />;
}
