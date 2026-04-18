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
  const streamRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const captureAudioContextRef = useRef(null);
  const captureWorkletNodeRef = useRef(null);

  useEffect(() => () => stopSession(), []);

  // 🔊 SIMPLE AUDIO PLAYBACK (FIXED)
  const playAudio = async (base64Chunk) => {
    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64Chunk}`);
      setIsAssistantSpeaking(true);

      audio.onended = () => {
        setIsAssistantSpeaking(false);
      };

      await audio.play();
    } catch (err) {
      console.log("Autoplay blocked:", err);
      setIsAssistantSpeaking(false);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = async () => {
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'session.start' }));

      const audioContext = new AudioContext({ sampleRate: 48000 });
      captureAudioContextRef.current = audioContext;

      console.log("Actual sample rate:", audioContext.sampleRate);

      // 🔥 AudioWorklet (STT pipeline)
      const workletCode = `
        class PcmTapProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0] && inputs[0][0];
            if (input && input.length) {
              const copy = new Float32Array(input.length);
              copy.set(input);
              this.port.postMessage(copy, [copy.buffer]);
            }
            return true;
          }
        }
        registerProcessor('pcm-tap', PcmTapProcessor);
      `;

      const blobUrl = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }));
      await audioContext.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const source = audioContext.createMediaStreamSource(streamRef.current);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1
      });

      captureWorkletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const input = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);

        const buffer = new ArrayBuffer(input.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          view.setInt16(i * 2, s * 0x7fff, true);
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(buffer); // ✅ PCM to backend
        }
      };

      const sink = audioContext.createGain();
      sink.gain.value = 0;

      source.connect(workletNode);
      workletNode.connect(sink);
      sink.connect(audioContext.destination);

      setIsListening(true);
    };

    ws.onmessage = async (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === 'stt.partial') {
        setPartialTranscript(payload.text);
      }

      if (payload.type === 'stt.final') {
        setPartialTranscript('');
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', text: payload.text }
        ]);
      }

      if (payload.type === 'assistant.text') {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', text: payload.text }
        ]);
      }

      // 🔥 FIXED AUDIO HANDLER
      if (payload.type === 'assistant.audio') {
        await playAudio(payload.audio);
      }

      if (payload.type === 'metrics.latency') {
        setLatency(payload.ms);
      }

      if (payload.type === 'error') {
        setError(payload.message);
      }
    };

    ws.onclose = () => {
      setIsListening(false);
      if (connectionState === 'connected' && reconnectAttemptsRef.current < 2) {
        reconnectAttemptsRef.current += 1;
        setTimeout(connectWebSocket, 500 * reconnectAttemptsRef.current);
      }
    };
  };

  const startSession = async () => {
    try {
      setError('');
      setConnectionState('connecting');

      const tokenRes = await fetch(`${API_BASE}/api/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: `user-${crypto.randomUUID()}` })
      });

      if (!tokenRes.ok) throw new Error('Failed to fetch LiveKit token');

      const { token, url } = await tokenRes.json();
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
      });

      await room.connect(url, token);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const [audioTrack] = stream.getAudioTracks();
      await room.localParticipant.publishTrack(audioTrack);

      connectWebSocket();
      setConnectionState('connected');
    } catch (err) {
      setError(err.message);
      setConnectionState('disconnected');
    }
  };

  const stopSession = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session.stop' }));
      wsRef.current.close();
    }

    if (captureWorkletNodeRef.current) {
      captureWorkletNodeRef.current.disconnect();
      captureWorkletNodeRef.current = null;
    }

    if (captureAudioContextRef.current) {
      captureAudioContextRef.current.close();
      captureAudioContextRef.current = null;
    }

    roomRef.current?.disconnect();

    setIsListening(false);
    setConnectionState('disconnected');
    setIsAssistantSpeaking(false);
  };

  const interruptAssistant = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'assistant.interrupt' }));
    }
    setIsAssistantSpeaking(false);
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