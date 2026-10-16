/**
 * Direct-browser voice. Signaling rides the room socket; media does not.
 * Avelis never receives audio. No recording, no captions, no waveform.
 * When plenary is paused (caucus), tracks stop.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRoom } from './RoomContext';

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
};

export function VoiceMesh({ paused }: { paused: boolean }) {
  const { presence, partyId, signals, sendSignal, isConnected, isFacilitator } = useRoom();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<'off' | 'live' | 'blocked'>('off');
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const streamRef = useRef<MediaStream | null>(null);
  const polite = useRef(false);

  const teardown = () => {
    for (const pc of pcs.current.values()) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    pcs.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('off');
  };

  useEffect(() => {
    if (!on || paused || !isConnected) {
      teardown();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStatus('live');
      } catch {
        setStatus('blocked');
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [on, paused, isConnected]);

  const others = presence.filter((p) => p.partyId !== partyId);

  useEffect(() => {
    if (!on || paused || status !== 'live' || !streamRef.current) return;
    const stream = streamRef.current;
    for (const peer of others) {
      if (pcs.current.has(peer.partyId)) continue;
      const pc = new RTCPeerConnection(ICE);
      pcs.current.set(peer.partyId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal(peer.partyId, { candidate: ev.candidate.toJSON() });
      };
      pc.ontrack = (ev) => {
        const audio = document.getElementById('avelis-voice-' + peer.partyId) as HTMLAudioElement | null;
        if (audio) {
          audio.srcObject = ev.streams[0] || null;
          void audio.play().catch(() => undefined);
        }
      };
      polite.current = partyId < peer.partyId;
      if (!polite.current) {
        void pc.createOffer().then(async (offer) => {
          await pc.setLocalDescription(offer);
          sendSignal(peer.partyId, { sdp: pc.localDescription });
        });
      }
    }
    for (const id of [...pcs.current.keys()]) {
      if (!others.some((p) => p.partyId === id)) {
        pcs.current.get(id)?.close();
        pcs.current.delete(id);
      }
    }
  }, [on, paused, status, others, partyId, sendSignal]);

  useEffect(() => {
    const last = signals[signals.length - 1];
    if (!last || !on || paused) return;
    const pc = pcs.current.get(last.from);
    if (!pc) return;
    const data = last.data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    void (async () => {
      try {
        if (data?.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(last.from, { sdp: pc.localDescription });
          }
        } else if (data?.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      } catch {
        // Negotiation glare is ignored; text still works.
      }
    })();
  }, [signals, on, paused, sendSignal]);

  return (
    <div className="room-voice">
      <button
        type="button"
        className="room-chip"
        disabled={!isConnected || paused}
        onClick={() => setOn((v) => !v)}
        aria-pressed={on && status === 'live'}
      >
        {paused ? 'Voice paused' : on && status === 'live' ? 'Voice live' : status === 'blocked' ? 'Voice blocked' : 'Voice'}
      </button>
      <p className="room-line__meta">
        {isFacilitator
          ? 'Direct between browsers. Avelis does not hear it. Not stored.'
          : 'Optional. Direct line. Not stored. Avelis does not hear it.'}
      </p>
      {others.map((p) => (
        <audio key={p.partyId} id={'avelis-voice-' + p.partyId} autoPlay playsInline />
      ))}
    </div>
  );
}
