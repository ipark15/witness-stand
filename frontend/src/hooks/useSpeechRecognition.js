import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Hook for browser-native speech recognition.
 * Returns transcribed text via onTranscript callback, which appends to the
 * existing input. Uses continuous mode so the user can keep speaking until
 * they click stop.
 *
 * @param {Object} opts
 * @param {(text: string) => void} opts.onTranscript - called with each final transcript chunk
 * @param {string} [opts.lang='en-US']
 */
export default function useSpeechRecognition({ onTranscript, lang = 'en-US' } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

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

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript && onTranscriptRef.current) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are non-fatal
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('SpeechRecognition error:', event.error);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // Already started — ignore
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}
