import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Dev-only diagnostic logging. Open the browser console to follow the event
// flow when troubleshooting dictation. Stripped in production builds.
const debug = import.meta.env?.DEV
  ? (...args) => console.debug('[speech]', ...args)
  : () => {};

/**
 * Hook for browser-native speech recognition.
 *
 * Chrome's `webkitSpeechRecognition` ends on its own after brief silence (or
 * sometimes immediately) even when `continuous=true`. To behave like a real
 * dictation toggle, we track user intent in a ref and auto-restart the engine
 * on `onend` until the user explicitly stops. Listening state is driven by
 * the engine's `onstart`/`onend` events (with intent gating) rather than set
 * optimistically, so the UI never lies about the mic.
 *
 * @param {Object} opts
 * @param {(text: string) => void} opts.onTranscript - called with each final transcript chunk
 * @param {string} [opts.lang='en-US']
 */
// Errors that mean "don't bother retrying" — either permission, hardware, or
// the remote speech service is unreachable. The latter ('network') is the
// common failure mode on Linux Chromium / Brave / Vivaldi because those builds
// ship without the Google Speech API key.
const UNRECOVERABLE_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'network',
]);

// Human-readable messages for errors we want to surface in the UI.
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone permission denied. Allow it in the site settings and try again.',
  'service-not-allowed': 'Microphone permission denied by the browser policy.',
  'audio-capture': 'No microphone detected. Check your input device.',
  network:
    "Speech recognition couldn't reach Google's transcription service. On Linux this usually means you're on Chromium / Brave / Vivaldi (which lack the Speech API key) \u2014 use official Google Chrome instead.",
};

export default function useSpeechRecognition({ onTranscript, lang = 'en-US' } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  // User intent. We use a ref (not state) so handlers always read the latest
  // value without re-binding, and so toggle() decisions are race-free.
  const shouldListenRef = useRef(false);

  // Keep callback ref fresh without re-creating recognition
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onstart = () => {
      debug('onstart');
      setListening(true);
    };

    recognition.onresult = (event) => {
      let transcript = '';
      let anyFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          anyFinal = true;
          transcript += result[0].transcript;
        }
      }
      debug('onresult', {
        resultIndex: event.resultIndex,
        total: event.results.length,
        anyFinal,
        transcript,
      });
      if (transcript && onTranscriptRef.current) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event) => {
      debug('onerror', event.error);
      // 'no-speech' and 'aborted' are routine; let onend decide whether to restart.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('SpeechRecognition error:', event.error);
      if (UNRECOVERABLE_ERRORS.has(event.error)) {
        // Stop the auto-restart loop and surface the failure to the UI so the
        // user isn't left staring at a silent, blinking mic.
        shouldListenRef.current = false;
        setError(ERROR_MESSAGES[event.error] || `Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      debug('onend', { shouldListen: shouldListenRef.current });
      // Chrome ends recognition on silence even with continuous=true. If the
      // user still wants to listen, restart on the next tick (calling start()
      // synchronously from onend is unreliable in some Chrome versions).
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (!shouldListenRef.current) {
            setListening(false);
            return;
          }
          try {
            debug('restart');
            recognition.start();
          } catch (err) {
            debug('restart failed', err);
            shouldListenRef.current = false;
            setListening(false);
          }
        }, 0);
        return;
      }
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      // Detach handlers first so a stale onend from abort() can't flip state
      // on a re-mounted instance (notably under React.StrictMode in dev).
      shouldListenRef.current = false;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    debug('user start');
    setError(null);
    shouldListenRef.current = true;
    try {
      recognitionRef.current.start();
    } catch (err) {
      debug('start threw', err);
      // Already started — onstart will (or has) fired.
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    debug('user stop');
    // Clear intent BEFORE stop() so the onend handler doesn't auto-restart.
    shouldListenRef.current = false;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    // Use the intent ref, not the listening state, to avoid a stale-closure
    // race where the user double-clicks faster than React commits.
    if (shouldListenRef.current) stop();
    else start();
  }, [start, stop]);

  return { listening, supported, error, start, stop, toggle };
}
