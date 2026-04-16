import React from 'react';
import { fetchAmplifyOutputsUrls, shouldLoadAmplifyOutputs } from './api-client.js';
import { ensureChatkitRuntime } from './runtime-loader.js';
import {
  clearThreadState,
  getOrCreateUserId,
  initializeOpenState,
  initializeThreadState,
  isMobile,
  lockBodyScroll,
  persistOpenState,
  persistThreadState,
  unlockBodyScroll,
} from './storage.js';

export function useChatWidgetState({ isDev, leadEmailUrl, locale, sessionUrl }) {
  const [open, setOpen] = React.useState(false);
  const [openInitialized, setOpenInitialized] = React.useState(false);
  const [userId, setUserId] = React.useState(null);
  const [threadId, setThreadId] = React.useState(null);
  const [resolvedSessionUrl, setResolvedSessionUrl] = React.useState(sessionUrl);
  const [resolvedLeadEmailUrl, setResolvedLeadEmailUrl] = React.useState(leadEmailUrl);
  const [chatMountId, setChatMountId] = React.useState(0);
  const [chatkitReady, setChatkitReady] = React.useState(false);
  const [runtimeReady, setRuntimeReady] = React.useState(false);
  const [runtimeError, setRuntimeError] = React.useState(null);
  const [chatkitError, setChatkitError] = React.useState(null);
  const [chatInstance, setChatInstance] = React.useState(null);

  const chatRef = React.useRef(null);
  const threadIdRef = React.useRef(null);
  const userIdRef = React.useRef(null);
  const localeRef = React.useRef(locale);
  const leadEmailUrlRef = React.useRef(leadEmailUrl);
  const chatPanelRef = React.useRef(null);
  const hasUserInteractedRef = React.useRef(false);

  React.useEffect(() => {
    const nextUserId = getOrCreateUserId();
    const nextThreadId = initializeThreadState();
    userIdRef.current = nextUserId;
    threadIdRef.current = nextThreadId;
    setUserId(nextUserId);
    setThreadId(nextThreadId);
  }, []);

  React.useEffect(() => {
    if (threadId !== null) {
      threadIdRef.current = threadId;
    }
  }, [threadId]);

  React.useEffect(() => {
    if (userId !== null) {
      userIdRef.current = userId;
    }
  }, [userId]);

  React.useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  React.useEffect(() => {
    leadEmailUrlRef.current = resolvedLeadEmailUrl;
  }, [resolvedLeadEmailUrl]);

  React.useEffect(() => {
    // Keep SSR hydration stable by rendering closed first, then applying per-device default after mount.
    setOpen(initializeOpenState());
    setOpenInitialized(true);
  }, []);

  React.useEffect(() => {
    setResolvedSessionUrl(sessionUrl);
  }, [sessionUrl]);

  React.useEffect(() => {
    leadEmailUrlRef.current = leadEmailUrl;
    setResolvedLeadEmailUrl(leadEmailUrl);
  }, [leadEmailUrl]);

  React.useEffect(() => {
    // In production, prefer the backend URL from Amplify outputs when available.
    // This avoids hard-coding a session endpoint URL per branch.
    if (isDev) return;
    if (!shouldLoadAmplifyOutputs({ sessionUrl, leadEmailUrl })) return;

    let cancelled = false;
    (async () => {
      const outputs = await fetchAmplifyOutputsUrls();
      if (!outputs || cancelled) return;
      if (outputs.sessionUrl) {
        setResolvedSessionUrl(outputs.sessionUrl);
      }
      if (outputs.leadEmailUrl) {
        leadEmailUrlRef.current = outputs.leadEmailUrl;
        setResolvedLeadEmailUrl(outputs.leadEmailUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDev, leadEmailUrl, sessionUrl]);

  React.useEffect(() => {
    let cancelled = false;
    ensureChatkitRuntime()
      .then(() => {
        if (cancelled) return;
        setRuntimeReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setRuntimeError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!openInitialized) return;
    persistOpenState(open);

    if (!open) {
      unlockBodyScroll();
      return;
    }
    if (!isMobile()) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open, openInitialized]);

  React.useEffect(() => {
    chatRef.current = chatInstance;
  }, [chatInstance]);

  const setActiveThreadId = React.useCallback((nextThreadId) => {
    persistThreadState(nextThreadId);
    threadIdRef.current = nextThreadId ?? null;
    setThreadId(nextThreadId ?? null);
  }, []);

  const clearStoredThread = React.useCallback(() => {
    clearThreadState();
    threadIdRef.current = null;
    setThreadId(null);
  }, []);

  return {
    open,
    setOpen,
    openInitialized,
    userId,
    userIdRef,
    threadId,
    threadIdRef,
    setActiveThreadId,
    clearStoredThread,
    resolvedSessionUrl,
    setResolvedSessionUrl,
    resolvedLeadEmailUrl,
    setResolvedLeadEmailUrl,
    chatMountId,
    setChatMountId,
    chatkitReady,
    setChatkitReady,
    runtimeReady,
    runtimeError,
    chatkitError,
    setChatkitError,
    chatInstance,
    setChatInstance,
    chatRef,
    localeRef,
    leadEmailUrlRef,
    chatPanelRef,
    hasUserInteractedRef,
  };
}
