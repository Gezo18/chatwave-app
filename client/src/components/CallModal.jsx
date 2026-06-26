import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import Avatar from './Avatar';
import { useSocket } from '../context/SocketContext';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const CallModal = forwardRef(function CallModal({ conversation, currentUserId }, ref) {
  const { emit, on, off, incomingCall, setIncomingCall } = useSocket();
  const [callState, setCallState] = useState('idle'); // idle, calling, ringing, connected
  const [callType, setCallType] = useState('audio');
  const [targetUser, setTargetUser] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const localStreamRef = useRef(null);
  const targetUserRef = useRef(null);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setTargetUser(null);
    targetUserRef.current = null;
    setMuted(false);
    setVideoOff(false);
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const createPeer = useCallback((stream, isInitiator, targetUserId) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        emit('call:signal', { targetUserId, signal: { type: 'ice-candidate', candidate: event.candidate } });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallState('connected');
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') cleanup();
    };

    return peer;
  }, [emit, cleanup]);

  const startCall = useCallback(async (type) => {
    const other = conversation?.type === 'direct'
      ? conversation.members?.find(m => m.id !== currentUserId)
      : null;
    if (!other) return;

    setCallType(type);
    setTargetUser(other);
    targetUserRef.current = other;
    setCallState('calling');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);

      emit('call:initiate', { conversationId: conversation.id, targetUserId: other.id, callType: type });

      const peer = createPeer(stream, true, other.id);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      emit('call:signal', { targetUserId: other.id, signal: { type: 'offer', sdp: offer.sdp } });

      callTimeoutRef.current = setTimeout(() => {
        if (callState === 'calling') {
          emit('call:end', { conversationId: conversation.id, targetUserId: other.id });
          cleanup();
        }
      }, 30000);
    } catch (err) {
      console.error('Failed to start call:', err);
      cleanup();
    }
  }, [conversation, currentUserId, emit, createPeer, cleanup, callState]);

  useImperativeHandle(ref, () => ({ startCall }), [startCall]);

  // Handle incoming call acceptance
  useEffect(() => {
    if (!incomingCall) return;

    const handleAccept = async () => {
      setCallState('connected');
      setCallType(incomingCall.callType);
      const caller = { id: incomingCall.callerId, username: incomingCall.callerName };
      setTargetUser(caller);
      targetUserRef.current = caller;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incomingCall.callType === 'video' });
        localStreamRef.current = stream;
        setLocalStream(stream);
        emit('call:accept', { conversationId: incomingCall.conversationId, callerId: incomingCall.callerId });
        createPeer(stream, false, incomingCall.callerId);
      } catch (err) {
        console.error('Failed to accept call:', err);
        cleanup();
      }
    };

    const handleReject = () => {
      emit('call:reject', { conversationId: incomingCall.conversationId, callerId: incomingCall.callerId });
      setIncomingCall(null);
      cleanup();
    };

    window.__callAccept = handleAccept;
    window.__callReject = handleReject;
    return () => { delete window.__callAccept; delete window.__callReject; };
  }, [incomingCall, emit, createPeer, cleanup, setIncomingCall]);

  // Handle signaling
  useEffect(() => {
    const handleSignal = async ({ fromUserId, signal }) => {
      const peer = peerRef.current;
      if (!peer) return;
      try {
        if (signal.type === 'offer') {
          await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          emit('call:signal', { targetUserId: fromUserId, signal: { type: 'answer', sdp: answer.sdp } });
        } else if (signal.type === 'answer') {
          await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        } else if (signal.type === 'ice-candidate') {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Signal error:', err);
      }
    };

    const handleAccepted = () => {
      setCallState('connected');
      if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    };
    const handleRejected = () => cleanup();
    const handleEnded = () => cleanup();

    on('call:signal', handleSignal);
    on('call:accepted', handleAccepted);
    on('call:rejected', handleRejected);
    on('call:ended', handleEnded);

    return () => {
      off('call:signal', handleSignal);
      off('call:accepted', handleAccepted);
      off('call:rejected', handleRejected);
      off('call:ended', handleEnded);
    };
  }, [on, off, emit, cleanup]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setVideoOff(!videoOff);
    }
  };

  const endCall = () => {
    if (targetUserRef.current) {
      emit('call:end', { conversationId: conversation?.id, targetUserId: targetUserRef.current.id });
    }
    cleanup();
  };

  // Incoming call ring UI
  if (incomingCall && callState !== 'connected') {
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--bg-light)] rounded-3xl p-8 text-center border border-[var(--border)] max-w-sm w-full mx-4">
            <Avatar name={incomingCall.callerName} size="xl" className="mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-1">{incomingCall.callerName}</h3>
            <p className="text-[var(--text-muted)] mb-6">Incoming {incomingCall.callType} call...</p>
            <div className="flex justify-center gap-6">
              <button onClick={window.__callReject} className="w-14 h-14 bg-[var(--danger)] rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button onClick={window.__callAccept} className="w-14 h-14 bg-[var(--success)] rounded-full flex items-center justify-center hover:bg-green-600 transition-colors phone-ring">
                <Phone className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Active call UI
  if (callState !== 'idle') {
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-[var(--bg)] flex flex-col">
          <div className="flex-1 flex items-center justify-center relative">
            {callType === 'video' && remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="call-video w-full h-full" />
            ) : (
              <div className="text-center">
                <Avatar name={targetUser?.username} size="xl" className="mx-auto mb-4" />
                <h3 className="text-xl font-semibold">{targetUser?.username}</h3>
                <p className="text-[var(--text-muted)]">
                  {callState === 'calling' ? 'Calling...' : callState === 'connected' ? (callType === 'video' ? 'Video Call' : 'Audio Call') : 'Ringing...'}
                </p>
              </div>
            )}
            {callType === 'video' && localStream && (
              <video ref={localVideoRef} autoPlay playsInline muted className="call-video call-video-local" />
            )}
            {callType === 'audio' && remoteStream && (
              <audio ref={remoteVideoRef} autoPlay />
            )}
          </div>
          <div className="p-6 flex justify-center gap-4">
            <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-[var(--danger)]' : 'bg-[var(--border)]'}`}>
              {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
            </button>
            {callType === 'video' && (
              <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${videoOff ? 'bg-[var(--danger)]' : 'bg-[var(--border)]'}`}>
                {videoOff ? <VideoOff className="w-5 h-5 text-white" /> : <Video className="w-5 h-5" />}
              </button>
            )}
            <button onClick={endCall} className="w-14 h-14 bg-[var(--danger)] rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
});

export default CallModal;
