import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';

const WS_URL = import.meta.env.VITE_VOICE_WS_URL || 'ws://localhost:8080/ws/voice';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export function useVoiceAgent() {
  const [messages, setMessages] = useState([]);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [latency, setLatency] = useState(null);
  const [error, setError] = useState('');

  const roomRef = useRef(null);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const playbackSourceRef = useRef(null);

  useEffect(() => {
    return () => stopSession();
  }, []);

  const enqueueAudio = async (base64Chunk) => {
    const binary = Uint8Array.from(atob(base64Chunk), (char) => char.charCodeAt(0));
    const ctx = audioContextRef.current || new AudioContext();
    audioContextRef.current = ctx;

    const buffer = await ctx.decodeAudioData(binary.buffer.slice(0));
    audioQueueRef.current.push(buffer);
    if (!playbackSourceRef.current) playNextAudioBuffer();
  };

  const playNextAudioBuffer = () => {
    const ctx = audioContextRef.current;
    const nextBuffer = audioQueueRef.current.shift();

    if (!ctx || !nextBuffer) {
      playbackSourceRef.current = null;
      setIsAssistantSpeaking(false);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = nextBuffer;
    source.connect(ctx.destination);
    source.onended = playNextAudioBuffer;
    source.start();
    playbackSourceRef.current = source;
    setIsAssistantSpeaking(true);
  };

  const clearAudioPlayback = () => {
    audioQueueRef.current = [];
    if (playbackSourceRef.current) playbackSourceRef.current.stop();
    playbackSourceRef.current = null;
    setIsAssistantSpeaking(false);
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'session.start' }));

      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size === 0 || ws.readyState !== WebSocket.OPEN) return;
        const arrayBuffer = await event.data.arrayBuffer();
        ws.send(arrayBuffer);
      };

      recorder.start(200);
      setIsListening(true);
    };

    ws.onmessage = async (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'stt.partial') setPartialTranscript(payload.text);
      if (payload.type === 'stt.final') {
        setPartialTranscript('');
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: payload.text }]);
      }
      if (payload.type === 'assistant.text') {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: payload.text }]);
      }
      if (payload.type === 'assistant.audio.chunk') await enqueueAudio(payload.audioBase64);
      if (payload.type === 'metrics.latency') setLatency(payload.ms);
      if (payload.type === 'error') setError(payload.message);
    };

    ws.onclose = () => {
      setIsListening(false);
      if (shouldReconnectRef.current && reconnectAttemptsRef.current < 2) {
        reconnectAttemptsRef.current += 1;
        setTimeout(connectWebSocket, 500 * reconnectAttemptsRef.current);
      }
    };
  };

  const startSession = async () => {
    try {
      setError('');
      shouldReconnectRef.current = true;
      setConnectionState('connecting');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const tokenRes = await fetch(`${API_BASE}/api/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: `user-${crypto.randomUUID()}` })
      });

      if (!tokenRes.ok) {
        const payload = await tokenRes.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch LiveKit token');
      }

      const tokenPayload = await tokenRes.json();

      if (tokenPayload.enabled) {
        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          setConnectionState(state);
        });

        await room.connect(tokenPayload.url, tokenPayload.token);

        const [audioTrack] = stream.getAudioTracks();
        await room.localParticipant.publishTrack(audioTrack);
      } else {
        setConnectionState('connected');
        setError(tokenPayload.reason || 'LiveKit disabled; using websocket-only mode.');
      }

      connectWebSocket();
      setConnectionState('connected');
    } catch (err) {
      setError(err.message);
      setConnectionState('disconnected');
      shouldReconnectRef.current = false;
    }
  };

  const stopSession = () => {
    shouldReconnectRef.current = false;
    clearAudioPlayback();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stt.flush' }));
      wsRef.current.send(JSON.stringify({ type: 'session.stop' }));
      wsRef.current.close();
    }

    roomRef.current?.disconnect();
    setIsListening(false);
    setConnectionState('disconnected');
  };

  const interruptAssistant = () => {
    clearAudioPlayback();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'assistant.interrupt' }));
    }
  };

  return {
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
  };
}
