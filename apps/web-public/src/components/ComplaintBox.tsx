'use client';
import { useEffect, useRef, useState } from 'react';
import Turnstile from './Turnstile';
import { IconCheck } from './icons';
import { isValidBdMobile, normalizeBdPhone, toBn, toEn } from '@jonoprotinidhi/shared/src/bangla.js';
import { COMPLAINT_MAX_FILES, COMPLAINT_MAX_FILE_B64, COMPLAINT_MAX_FILE_BYTES, COMPLAINT_MAX_VOICE_B64, COMPLAINT_MAX_VOICE_SEC } from '@jonoprotinidhi/shared/src/complaintLimits.js';
import { overTotal, plainDataUrl, readAsDataUrl, shrinkImage } from '@/lib/attachments';
import { COMPLAINT_STATUS, bnDateSafe, joinParts } from '@/lib/format';
import type { TrackResult, Upazila } from '@/lib/types';

type Props = { categories: string[]; upazilas: Upazila[]; otpRequired: boolean; enabled: boolean; privacyNote: string; turnstileSiteKey: string };
type Errs = Partial<Record<'category' | 'upazila' | 'union' | 'description' | 'phone' | 'name' | 'place' | 'otp', string>>;
type ApiErr = { error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[]>; retryAfterSec?: number } } };

const FIELD_MSG: Record<string, string> = {
  category: 'বিষয় বেছে নিন।', upazila: 'উপজেলা বেছে নিন।', union: 'ইউনিয়ন বা পৌরসভা বেছে নিন।',
  description: 'সমস্যাটা অন্তত ২০ অক্ষরে লিখুন (সর্বোচ্চ ১০,০০০)।', phone: 'সঠিক মোবাইল নম্বর দিন, ১১ সংখ্যার, ০১ দিয়ে শুরু।',
  name: 'নাম সর্বোচ্চ ৮০ অক্ষর।', place: 'ঠিকানা সর্বোচ্চ ১০০ অক্ষর।',
};

async function call<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; err: ApiErr }> {
  try {
    const res = await fetch(`/api/public/${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: j as T } : { ok: false, status: res.status, err: j as ApiErr };
  } catch {
    return { ok: false, status: 0, err: { error: { message: 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' } } };
  }
}
const errMsg = (r: { status: number; err: ApiErr }) =>
  r.status === 429 ? 'অনেক বেশি চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' : r.err.error?.message || 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।';

/** Photos larger than this are refused before decoding; anything up to it is shrunk to 1600 px in the browser. */
const RAW_IMAGE_MAX = 20 * 1024 * 1024;
const TOTAL_MSG = 'সব ছবি, PDF ও ভয়েস মিলিয়ে সীমার বেশি হয়ে যাচ্ছে। কিছু ফাইল বাদ দিন বা ছোট PDF দিন।';

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const sc = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${sc < 10 ? '0' : ''}${sc}`;
}

const WAVE_BARS = [26, 42, 65, 36, 78, 96, 62, 44, 85, 100, 72, 48, 64, 88, 56, 34, 58, 86, 94, 76, 44, 68, 82, 58, 38, 92, 74, 52, 36, 72, 88, 62, 46, 64, 78, 42];

function VoicePreviewPlayer({ audioUrl, durationSec }: { audioUrl: string; durationSec: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const onWaveClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * (durationSec || audio.duration || 1);
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const totalDuration = Math.max(durationSec, Math.ceil(currentTime), 1);
  const progressRatio = Math.max(0, Math.min(1, currentTime / totalDuration));

  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(135deg, rgba(18, 140, 126, 0.12) 0%, rgba(37, 211, 102, 0.07) 45%, rgba(0, 0, 0, 0.5) 100%)',
      borderRadius: '12px',
      border: '1px solid rgba(37, 211, 102, 0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
    }}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />
      
      {/* WhatsApp Voice Bubble Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* WhatsApp Green Circular Play/Pause Button */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'ভয়েস থামান' : 'ভয়েস চালান'}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: '#25D366',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(37, 211, 102, 0.4)',
            flexShrink: 0,
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.94)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        {/* Waveform and Progress Bar */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            onClick={onWaveClick}
            title="যেকোনো অংশে লাফিয়ে শুনতে ক্লিক করুন"
            style={{
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '2.5px',
              cursor: 'pointer',
              padding: '2px 0',
              userSelect: 'none',
              overflow: 'hidden'
            }}
          >
            {WAVE_BARS.map((height, idx) => {
              const barRatio = (idx + 0.5) / WAVE_BARS.length;
              const isPlayed = barRatio <= progressRatio;
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    minWidth: '2.5px',
                    maxWidth: '4.5px',
                    height: `${height}%`,
                    borderRadius: '2px',
                    backgroundColor: isPlayed ? '#25D366' : 'rgba(255, 255, 255, 0.28)',
                    transition: 'background-color 0.1s ease',
                  }}
                />
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-light, #f1f5f9)', fontFamily: 'monospace' }}>
              {toBn(formatSec(Math.floor(currentTime)))} / {toBn(formatSec(durationSec))}
            </span>

            <button
              type="button"
              onClick={cycleSpeed}
              title="প্লেব্যাক স্পিড পরিবর্তন করুন"
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                color: 'var(--text-light, #f1f5f9)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {toBn(speed)}x
            </button>
          </div>
        </div>

        {/* WhatsApp Mic Avatar & Double-check delivery badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            backgroundColor: 'rgba(37, 211, 102, 0.15)',
            border: '1px solid rgba(37, 211, 102, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#25D366'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </div>
          <span style={{ fontSize: '11px', color: '#53bdeb', fontWeight: 800, letterSpacing: '-0.5px' }} title="অভিযোগের সাথে যাওয়ার জন্য প্রস্তুত">
            ✓✓
          </span>
        </div>
      </div>

      {/* WhatsApp delivery assurance */}
      <div style={{
        marginTop: '2px',
        padding: '7px 10px',
        borderRadius: '6px',
        backgroundColor: 'rgba(37, 211, 102, 0.08)',
        border: '1px solid rgba(37, 211, 102, 0.22)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ color: '#25D366', fontSize: '14px', flexShrink: 0 }}>✓</span>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-light, #e2e8f0)', lineHeight: 1.4 }}>
          <b>ভয়েস মেসেজ সংযুক্ত হয়েছে:</b> অভিযোগ জমা দেওয়ার সাথে সাথে এই ভয়েস রেকর্ড সরাসরি এমপির ড্যাশবোর্ডে চলে যাবে।
        </p>
      </div>
    </div>
  );
}

export default function ComplaintBox({ categories, upazilas, otpRequired, enabled, privacyNote, turnstileSiteKey }: Props) {
  const [tab, setTab] = useState<'new' | 'track'>('new');
  const [f, setF] = useState({ category: '', upazila: '', union: '', place: '', description: '', anonymous: false, name: '', phone: '' });
  const [errs, setErrs] = useState<Errs>({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [tsKey, setTsKey] = useState(0);
  const [otp, setOtp] = useState({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' });
  const [done, setDone] = useState<{ id: string; anonymous: boolean; phone: string } | null>(null);
  const [trackId, setTrackId] = useState('');
  const [track, setTrack] = useState<{ busy: boolean; res: TrackResult | null; err: string }>({ busy: false, res: null, err: '' });
  const formRef = useRef<HTMLFormElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  // Voice recording state
  const [voiceNote, setVoiceNote] = useState<{ audioData: string; audioUrl: string; durationSec: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [recError, setRecError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordSecRef = useRef(0);

  // File upload state (images/PDF, max 5)
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; mimeType: string; size: number; data: string }>>([]);
  const attachedFilesRef = useRef(attachedFiles); // read by the recorder's onstop callback, which outlives a render
  attachedFilesRef.current = attachedFiles;
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => { if (window.location.hash === '#track') setTab('track'); };
    sync();
    window.addEventListener('hashchange', sync);
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then((p) => {
        p.onchange = () => {
          if (p.state === 'granted') setRecError('');
        };
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('hashchange', sync);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);
  useEffect(() => { if (done) ticketRef.current?.focus(); }, [done]);

  const upz = upazilas.find((u) => (u.short || u.name) === f.upazila);
  const unions = upz?.unions ?? [];
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v, ...(k === 'upazila' ? { union: '' } : {}) })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const needOtp = otpRequired && !f.anonymous;
  const phoneN = normalizeBdPhone(f.phone);
  // the number changed after it was verified: it has to be verified again
  useEffect(() => { if (otp.phone && otp.phone !== phoneN) setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' }); }, [phoneN, otp.phone]);

  function validate(targetF = f): Errs {
    const e: Errs = {};
    if (!targetF.category) e.category = FIELD_MSG.category;
    if (targetF.upazila.trim().length < 2) e.upazila = FIELD_MSG.upazila;
    if (targetF.union.trim().length < 2) e.union = FIELD_MSG.union;
    const hasVoice = Boolean(voiceNote);
    const d = targetF.description.trim().length;
    if (!hasVoice && d < 20) {
      e.description = 'সমস্যার লিখিত বিবরণ লিখুন (অন্তত ২০ অক্ষর) অথবা ভয়েস রেকর্ড করুন।';
    } else if (d > 10000) {
      e.description = 'বিবরণ সর্বোচ্চ ১০,০০০ অক্ষর।';
    }
    if (!targetF.anonymous && !isValidBdMobile(targetF.phone)) e.phone = FIELD_MSG.phone;
    if (targetF.name.length > 80) e.name = FIELD_MSG.name;
    if (needOtp && !otp.ticket) e.otp = 'মোবাইল নম্বরটি কোড দিয়ে যাচাই করুন।';
    return e;
  }

  async function getMediaStream(): Promise<MediaStream> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }
    const legacy = typeof navigator !== 'undefined' && (
      (navigator as any).getUserMedia ||
      (navigator as any).webkitGetUserMedia ||
      (navigator as any).mozGetUserMedia ||
      (navigator as any).msGetUserMedia
    );
    if (legacy) {
      return new Promise<MediaStream>((resolve, reject) => {
        legacy.call(navigator, { audio: true }, resolve, reject);
      });
    }
    throw new Error('NO_MEDIA_DEVICES');
  }

  async function startVoiceRecording() {
    setRecError('');

    // Check secure context
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setRecError('ব্রাউজারের নিরাপত্তার কারণে শুধু নিরাপদ (https://) ঠিকানায় ভয়েস রেকর্ড করা যায়। চাইলে নিচে লিখে অভিযোগ পাঠাতে পারেন।');
      return;
    }

    try {
      const stream = await getMediaStream();
      streamRef.current = stream;
      audioChunksRef.current = [];
      setRecordSec(0);
      recordSecRef.current = 0;

      let recorder: MediaRecorder;
      try {
        let preferredMime = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) preferredMime = 'audio/webm;codecs=opus';
          else if (MediaRecorder.isTypeSupported('audio/webm')) preferredMime = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) preferredMime = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/ogg')) preferredMime = 'audio/ogg';
        }
        // 32 kbps is plenty for speech and keeps 3 minutes well under the upload limit
        recorder = new MediaRecorder(stream, { ...(preferredMime ? { mimeType: preferredMime } : {}), audioBitsPerSecond: 32_000 });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        try {
          const mimeType = recorder.mimeType || 'audio/webm';
          const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const blobUrl = URL.createObjectURL(recordedBlob);

          // Stop mic tracks cleanly after data is flushed and blob created
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = plainDataUrl(reader.result as string);
            if (base64data.length > COMPLAINT_MAX_VOICE_B64 || overTotal(attachedFilesRef.current, base64data)) {
              URL.revokeObjectURL(blobUrl);
              setRecError(base64data.length > COMPLAINT_MAX_VOICE_B64 ? 'ভয়েস রেকর্ডটি অনেক বড় হয়ে গেছে। একটু ছোট করে আবার রেকর্ড করুন।' : TOTAL_MSG);
              return;
            }
            setVoiceNote((prev) => {
              if (prev?.audioUrl && prev.audioUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(prev.audioUrl); } catch {}
              }
              return {
                audioData: base64data,
                audioUrl: blobUrl,
                durationSec: Math.max(1, recordSecRef.current),
              };
            });
            setErrs((e) => ({ ...e, description: undefined }));
          };
          reader.readAsDataURL(recordedBlob);
        } catch (err) {
          console.error('onstop error:', err);
          setRecError('ভয়েস রেকর্ড তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
        }
      };

      try {
        recorder.start(1000);
      } catch {
        recorder.start();
      }
      setRecording(true);

      let sec = 0;
      timerRef.current = setInterval(() => {
        sec += 1;
        recordSecRef.current = sec;
        setRecordSec(sec);
        if (sec >= COMPLAINT_MAX_VOICE_SEC) {
          stopVoiceRecording();
        }
      }, 1000);
    } catch (err: any) {
      console.error('startVoiceRecording error:', err);
      const name = err?.name || '';
      const msg = err?.message || String(err);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setRecError('মাইক্রোফোনের অনুমতি ব্রাউজারে ব্লক করা রয়েছে। অনুগ্রহ করে ব্রাউজারের অ্যাড্রেস বারে 🔒 আইকন থেকে Microphone Allow করে পেজ রিলোড দিন।');
      } else if (msg === 'NO_MEDIA_DEVICES' || name === 'NotFoundError') {
        setRecError('আপনার ডিভাইসে কোনো মাইক্রোফোন পাওয়া যায়নি। চাইলে নিচে লিখে অভিযোগ পাঠাতে পারেন।');
      } else {
        setRecError('মাইক্রোফোন চালু করা যায়নি। অন্য কোনো অ্যাপ মাইক্রোফোন ব্যবহার করছে কিনা দেখুন, পেজটি রিফ্রেশ করে আবার চেষ্টা করুন, অথবা নিচে লিখে অভিযোগ পাঠান।');
      }
    }
  }

  function stopVoiceRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.requestData(); } catch {}
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setRecording(false);
  }

  function cancelVoiceRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    audioChunksRef.current = [];
    setRecordSec(0);
    recordSecRef.current = 0;
    setRecording(false);
  }

  function removeVoiceNote() {
    if (voiceNote?.audioUrl && voiceNote.audioUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(voiceNote.audioUrl); } catch {}
    }
    cancelVoiceRecording();
    setVoiceNote(null);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setFileError('');
    const stop = (msg: string) => { setFileError(msg); if (fileInputRef.current) fileInputRef.current.value = ''; };

    if (attachedFiles.length + selected.length > COMPLAINT_MAX_FILES) {
      return stop(`সর্বোচ্চ ${toBn(COMPLAINT_MAX_FILES)}টি ফাইল যোগ করতে পারবেন। ইতিমধ্যে ${toBn(attachedFiles.length)}টি ফাইল নির্বাচন করেছেন।`);
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const newFiles: Array<{ name: string; mimeType: string; size: number; data: string }> = [];

    for (const file of selected) {
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
      if (!allowedMimes.includes(mime)) return stop(`"${file.name}" সমর্থিত নয়। শুধুমাত্র ছবি (JPG, PNG, WEBP) অথবা PDF ফাইল আপলোড করতে পারবেন।`);
      const isPdf = mime === 'application/pdf';
      if (file.size > (isPdf ? COMPLAINT_MAX_FILE_BYTES : RAW_IMAGE_MAX)) {
        return stop(isPdf ? `"${file.name}" ফাইলটির আকার ৫ মেগাবাইটের বেশি। অনুগ্রহ করে ৫ মেগাবাইটের নিচের PDF দিন।` : `"${file.name}" ছবিটি অনেক বড় (২০ মেগাবাইটের বেশি)। অন্য একটি ছবি দিন।`);
      }
      try {
        // BUG-2026-028: photos are shrunk to 1600 px JPEG here, so a phone photo of several MB becomes a few hundred KB
        if (isPdf) newFiles.push({ name: file.name, mimeType: mime, size: file.size, data: plainDataUrl(await readAsDataUrl(file)) });
        else newFiles.push({ name: file.name.replace(/\.[^.]{1,5}$/, '') + '.jpg', ...(await shrinkImage(file)) });
      } catch {
        return stop(`"${file.name}" ফাইলটি পড়া যায়নি। অন্য একটি ফাইল দিন।`);
      }
      if (newFiles[newFiles.length - 1]!.data.length > COMPLAINT_MAX_FILE_B64) return stop(`"${file.name}" ফাইলটি অনেক বড়। ছোট একটি ফাইল দিন।`);
    }

    if (overTotal([...attachedFiles, ...newFiles], voiceNote?.audioData)) return stop(TOTAL_MSG);
    setAttachedFiles((prev) => [...prev, ...newFiles].slice(0, COMPLAINT_MAX_FILES));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachedFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError('');
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function sendOtp() {
    if (!isValidBdMobile(f.phone)) { setErrs((e) => ({ ...e, phone: FIELD_MSG.phone })); return; }
    setOtp((o) => ({ ...o, busy: true, msg: '' }));
    const r = await call<{ ok: boolean }>('otp/send', { phone: phoneN, turnstileToken: token || undefined });
    setTsKey((k) => k + 1); // a Turnstile token is single-use: get a fresh one for the submission
    setOtp((o) => ({ ...o, busy: false, sent: r.ok, phone: phoneN, msg: r.ok ? `${toBn(phoneN.slice(0, 3))}•••••${toBn(phoneN.slice(-3))} নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে।` : errMsg(r) }));
  }
  async function verifyOtp() {
    const code = toEn(otp.code).replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { setOtp((o) => ({ ...o, msg: '৬ সংখ্যার কোডটি লিখুন।' })); return; }
    setOtp((o) => ({ ...o, busy: true, msg: '' }));
    const r = await call<{ otpTicket: string }>('otp/verify', { phone: phoneN, code });
    setOtp((o) => ({ ...o, busy: false, ticket: r.ok ? r.data.otpTicket : '', msg: r.ok ? 'নম্বর যাচাই হয়েছে।' : errMsg(r) }));
    if (r.ok) setErrs((e) => ({ ...e, otp: undefined }));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setAlert('');

    // BUG-2026-030: an empty description stays empty (no canned sentence stored as the citizen's words)
    const curF = f;
    const e = validate(curF);
    setErrs(e);
    const firstBad = (Object.keys(e) as Array<keyof Errs>)[0];
    if (firstBad) { formRef.current?.querySelector<HTMLElement>(`[data-f="${firstBad}"]`)?.focus(); return; }
    if (overTotal(attachedFiles, voiceNote?.audioData)) { setFileError(TOTAL_MSG); setAlert(TOTAL_MSG); return; }
    if (!token) { setAlert('স্প্যাম যাচাই এখনো শেষ হয়নি, কয়েক সেকেন্ড পর আবার চাপুন।'); return; }
    setBusy(true);
    const body = {
      category: curF.category, upazila: curF.upazila.trim(), union: curF.union.trim(), place: curF.place.trim(), description: curF.description.trim(),
      anonymous: curF.anonymous, name: curF.anonymous ? '' : curF.name.trim(), phone: curF.anonymous ? '' : phoneN,
      ...(needOtp && otp.ticket ? { otpTicket: otp.ticket } : {}), turnstileToken: token,
      ...(voiceNote ? { voiceNote: { audioData: voiceNote.audioData, durationSec: voiceNote.durationSec } } : {}),
      ...(attachedFiles.length > 0 ? { files: attachedFiles } : {}),
    };
    const r = await call<{ trackingId: string }>('complaints', body);
    setBusy(false);
    setTsKey((k) => k + 1);
    if (r.ok) { setDone({ id: r.data.trackingId, anonymous: curF.anonymous, phone: phoneN }); return; }
    const fe = r.err.error?.details?.fieldErrors;
    if (fe && Object.keys(fe).length) {
      const mapped: Errs = {};
      for (const k of Object.keys(fe)) if (k in FIELD_MSG) mapped[k as keyof Errs] = FIELD_MSG[k];
      setErrs(mapped);
      if (fe.files?.[0]) setFileError(fe.files[0]);
    }
    if (r.err.error?.code === 'OTP_REQUIRED') setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' });
    setAlert(errMsg(r));
  }

  async function doTrack(raw: string) {
    const id = toEn(raw).trim().toUpperCase().replace(/\s+/g, '');
    if (!id) { setTrack({ busy: false, res: null, err: 'ট্র্যাকিং আইডি লিখুন।' }); return; }
    if (!/^[A-Z0-9-]{3,40}$/.test(id)) { setTrack({ busy: false, res: null, err: 'আইডিটি সঠিক নয়। যেমন: NDP3-2026-00012' }); return; }
    setTrack({ busy: true, res: null, err: '' });
    const r = await call<TrackResult>(`complaints/${encodeURIComponent(id)}`);
    setTrack({ busy: false, res: r.ok ? r.data : null, err: r.ok ? '' : r.status === 404 ? `${id} আইডিতে কোনো অভিযোগ পাওয়া যায়নি। আইডিটি আবার দেখে লিখুন।` : errMsg(r) });
  }

  const reset = () => {
    setF({ category: '', upazila: '', union: '', place: '', description: '', anonymous: false, name: '', phone: '' });
    setErrs({});
    setAlert('');
    setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' });
    setDone(null);
    removeVoiceNote();
    setAttachedFiles([]);
    setFileError('');
  };
  const E = ({ k }: { k: keyof Errs }) => (errs[k] ? <p className="err" id={`e-${k}`}>{errs[k]}</p> : null);
  const inv = (k: keyof Errs) => ({ 'aria-invalid': errs[k] ? true : undefined, 'aria-describedby': errs[k] ? `e-${k}` : undefined, 'data-f': k });

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="অভিযোগ">
        <button className="tab" role="tab" type="button" id="tab-new" aria-selected={tab === 'new'} aria-controls="pane-new" onClick={() => setTab('new')}>নতুন অভিযোগ</button>
        <button className="tab" role="tab" type="button" id="tab-track" aria-selected={tab === 'track'} aria-controls="pane-track" onClick={() => setTab('track')}>অভিযোগের অবস্থা দেখুন</button>
      </div>

      <div id="pane-new" role="tabpanel" aria-labelledby="tab-new" hidden={tab !== 'new'}>
        {!enabled ? <p className="alert">অভিযোগ বক্স এখন বন্ধ আছে। জরুরি প্রয়োজনে যোগাযোগ পাতার নম্বরে ফোন করুন।</p> : done ? (
          <div className="ticket" ref={ticketRef} tabIndex={-1} aria-live="polite">
            <p className="kicker">অভিযোগ জমা হয়েছে</p>
            <p className="hint" style={{ marginTop: 10 }}>আপনার ট্র্যাকিং আইডি</p>
            <p className="tid" data-testid="tracking-id">{done.id}</p>
            <p style={{ margin: 0 }}>{done.anonymous
              ? 'বেনামী অভিযোগে SMS যায় না। আইডিটি লিখে রাখুন, এটা দিয়েই অবস্থা দেখতে পারবেন।'
              : `আইডিসহ একটি SMS যাবে ${toBn(done.phone.slice(0, 3))}•••••${toBn(done.phone.slice(-3))} নম্বরে।`}</p>
            <div className="acts">
              <CopyId id={done.id} />
              <button type="button" className="btn btn-brass" onClick={() => { setTrackId(done.id); setTab('track'); void doTrack(done.id); }}>অবস্থা দেখুন</button>
              <button type="button" className="linkbtn" onClick={reset}>আরেকটি অভিযোগ করুন</button>
            </div>
          </div>
        ) : (
          <form className="cmp" ref={formRef} noValidate onSubmit={submit}>
            <div className="frow">
              <div className="field">
                <label htmlFor="fCat">বিষয় <span className="req">*</span></label>
                <select id="fCat" value={f.category} onChange={(e) => set('category', e.target.value)} {...inv('category')}>
                  <option value="">বেছে নিন</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select><E k="category" />
              </div>
              <div className="field">
                <label htmlFor="fUpz">উপজেলা <span className="req">*</span></label>
                {upazilas.length ? (
                  <select id="fUpz" value={f.upazila} onChange={(e) => set('upazila', e.target.value)} {...inv('upazila')}>
                    <option value="">বেছে নিন</option>
                    {upazilas.map((u) => <option key={u.name} value={u.short || u.name}>{u.short || u.name}</option>)}
                  </select>
                ) : <input type="text" id="fUpz" maxLength={60} value={f.upazila} onChange={(e) => set('upazila', e.target.value)} {...inv('upazila')} />}
                <E k="upazila" />
              </div>
            </div>
            <div className="frow">
              <div className="field">
                <label htmlFor="fUnion">ইউনিয়ন / পৌরসভা <span className="req">*</span></label>
                {upazilas.length && (unions.length || !f.upazila) ? (
                  <select id="fUnion" value={f.union} disabled={!f.upazila} onChange={(e) => set('union', e.target.value)} {...inv('union')}>
                    <option value="">{f.upazila ? 'বেছে নিন' : 'আগে উপজেলা বেছে নিন'}</option>
                    {unions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : <input type="text" id="fUnion" maxLength={60} value={f.union} onChange={(e) => set('union', e.target.value)} {...inv('union')} />}
                <E k="union" />
              </div>
              <div className="field">
                <label htmlFor="fPlace">গ্রাম / মহল্লা / ওয়ার্ড</label>
                <input type="text" id="fPlace" maxLength={100} value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="যেমন: ৪ নম্বর ওয়ার্ড" {...inv('place')} /><E k="place" />
              </div>
            </div>

            {/* Dedicated Voice Record Section */}
            <div style={{
              margin: '14px 0 16px',
              padding: '16px 18px',
              background: 'linear-gradient(135deg, rgba(199,163,90,0.08) 0%, rgba(20,24,20,0.65) 100%)',
              border: '1px solid rgba(199,163,90,0.28)',
              borderRadius: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: recording ? 'rgba(229,62,62,0.2)' : 'rgba(199,163,90,0.16)',
                    color: recording ? '#e53e3e' : 'var(--brass-2)',
                    fontSize: '19px',
                    flexShrink: 0
                  }}>
                    🎙️
                  </span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--brass-2)' }}>
                      ভয়েস মেসেজ
                    </h4>
                    <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--muted, #cbd5e0)' }}>
                      টাইপ করতে না চাইলে সরাসরি ভয়েস রেকর্ড করে অভিযোগ পাঠাতে পারেন।
                    </p>
                  </div>
                </div>

                {!recording && !voiceNote && (
                  <button
                    type="button"
                    id="btn-voice-record-main"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '9px',
                      padding: '9px 20px',
                      fontSize: '14.5px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #128C7E 0%, #25D366 100%)',
                      color: '#ffffff',
                      border: 'none',
                      boxShadow: '0 3px 12px rgba(37,211,102,0.3)',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    onClick={startVoiceRecording}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                    ভয়েস মেসেজ রেকর্ড করুন
                  </button>
                )}
              </div>

              {/* Active Recording State */}
              {recording && (
                <div style={{
                  marginTop: '14px',
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, rgba(234, 67, 53, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
                  borderRadius: '12px',
                  border: '1px solid rgba(234, 67, 53, 0.35)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                }} role="status" aria-live="polite">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    {/* Pulsing Red Mic */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      backgroundColor: '#ea4335',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 0 14px rgba(234, 67, 53, 0.6)',
                      animation: 'voicePulse 1.2s infinite',
                      flexShrink: 0
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" x2="12" y1="19" y2="22"/>
                      </svg>
                    </div>

                    {/* Timer & Live wave animation */}
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: '#ff6b6b', letterSpacing: '0.05em' }}>
                          🔴 {toBn(formatSec(recordSec))} / {toBn(formatSec(COMPLAINT_MAX_VOICE_SEC))}
                        </span>
                        <span style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(234,67,53,0.2)', color: '#ff8787', fontWeight: 600 }}>
                          ভয়েস রেকর্ড হচ্ছে
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted, #cbd5e0)' }}>
                        স্পষ্টভাবে আপনার অভিযোগের কথা বলুন...
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={cancelVoiceRecording}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(234,67,53,0.4)',
                          color: '#ff8787',
                          borderRadius: '6px',
                          padding: '7px 14px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ✕ বাতিল
                      </button>
                      <button
                        type="button"
                        onClick={stopVoiceRecording}
                        style={{
                          backgroundColor: '#25D366',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '7px 16px',
                          fontSize: '13.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 10px rgba(37,211,102,0.35)'
                        }}
                      >
                        ✓ রেকর্ড সম্পন্ন
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed Voice Recording */}
              {voiceNote && !recording && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(199,163,90,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--brass-2)' }}>
                        ✓ ভয়েস রেকর্ড সফল হয়েছে ({toBn(formatSec(voiceNote.durationSec))})
                      </span>
                      <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted, #cbd5e0)' }}>
                        নিচের প্লে বাটনে চাপ দিয়ে রেকর্ডটি শুনুন এবং কথা স্পষ্ট আছে কিনা যাচাই করুন:
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-line btn-sm" onClick={startVoiceRecording} style={{ fontSize: '12.5px', padding: '4px 10px' }}>
                        🔄 আবার রেকর্ড করুন
                      </button>
                      <button type="button" className="btn btn-line btn-sm" onClick={removeVoiceNote} style={{ fontSize: '12.5px', padding: '4px 10px', color: 'var(--err, #e53e3e)', borderColor: 'rgba(229,62,62,0.4)' }}>
                        🗑️ মুছে ফেলুন
                      </button>
                    </div>
                  </div>
                  <VoicePreviewPlayer
                    audioUrl={voiceNote.audioUrl || voiceNote.audioData}
                    durationSec={voiceNote.durationSec}
                  />
                </div>
              )}

              {recError && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.4)', borderRadius: '6px', fontSize: '13.5px', color: 'var(--err, #feb2b2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <p style={{ margin: 0 }}>{recError}</p>
                  <button type="button" className="btn btn-brass btn-sm" onClick={startVoiceRecording} style={{ fontSize: '12.5px', padding: '3px 10px', whiteSpace: 'nowrap' }}>
                    আবার চেষ্টা করুন
                  </button>
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="fText">
                সমস্যার লিখিত বিবরণ {voiceNote ? <span style={{ color: 'var(--brass-2)', fontWeight: 500 }}>(ঐচ্ছিক - ভয়েস রেকর্ড সংযুক্ত আছে)</span> : <span className="req">*</span>}
              </label>
              <textarea
                id="fText"
                maxLength={10000}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder={voiceNote ? 'ভয়েস রেকর্ড যুক্ত আছে। চাইলে অতিরিক্ত কোনো তথ্য এখানে লিখে জানাতে পারেন (ঐচ্ছিক)' : 'কী সমস্যা, কবে থেকে, কতজন ভুক্তভোগী (অন্তত ২০ অক্ষর লিখুন অথবা উপরের ভয়েস রেকর্ড ব্যবহার করুন)'}
                {...inv('description')}
              />
              <div className="split"><E k="description" /><span className="hint" style={{ marginLeft: 'auto' }} aria-live="polite">{toBn(f.description.length)}/১০,০০০</span></div>
            </div>

            {/* File Upload Section (Images / PDFs, max 5) */}
            <div style={{
              margin: '14px 0 18px',
              padding: '16px 18px',
              background: 'rgba(239,234,224,0.03)',
              border: '1px solid rgba(199,163,90,0.25)',
              borderRadius: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--text-light)' }}>
                    📎 প্রমাণ বা ছবি / PDF সংযুক্তি <small className="hint" style={{ fontSize: '13px' }}>(ঐচ্ছিক, সর্বোচ্চ ৫টি ফাইল)</small>
                  </h4>
                  <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted-light, #a0aec0)' }}>
                    সমস্যার ছবি বা সংশ্লিষ্ট কোনো PDF আবেদনপত্র থাকলে যোগ করুন (PDF সর্বোচ্চ ৫ MB; বড় ছবি নিজে থেকেই ছোট করে নেওয়া হবে)।
                  </p>
                </div>
                {attachedFiles.length < 5 && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="fUploadInput"
                      multiple
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                    <button
                      type="button"
                      id="btn-upload-file"
                      className="btn btn-line btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        padding: '6px 14px',
                        borderColor: 'var(--brass-2)',
                        color: 'var(--brass-2)',
                        cursor: 'pointer'
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      ফাইল যোগ করুন ({toBn(attachedFiles.length)}/৫)
                    </button>
                  </div>
                )}
              </div>

              {fileError && (
                <p className="err" style={{ marginTop: '8px', fontSize: '13px' }}>{fileError}</p>
              )}

              {/* Selected Files List / Thumbnails */}
              {attachedFiles.length > 0 && (
                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '10px' }}>
                  {attachedFiles.map((file, idx) => {
                    const isImg = file.mimeType.startsWith('image/');
                    return (
                      <div key={idx} style={{ position: 'relative', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(199,163,90,0.25)', display: 'flex', flexDirection: 'column' }}>
                        <button
                          type="button"
                          onClick={() => removeAttachedFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'rgba(229,62,62,0.85)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            zIndex: 2
                          }}
                        >
                          ✕
                        </button>
                        {isImg ? (
                          <img src={file.data} alt={file.name} style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '4px', marginBottom: '6px' }} />
                        ) : (
                          <div style={{ width: '100%', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '6px', fontSize: '28px' }}>
                            📄
                          </div>
                        )}
                        <p style={{ margin: 0, fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-light)' }} title={file.name}>
                          {file.name}
                        </p>
                        <small style={{ fontSize: '10.5px', color: 'var(--muted-light)' }}>{formatBytes(file.size)}</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="check" htmlFor="fAnon">
              <input type="checkbox" id="fAnon" checked={f.anonymous} onChange={(e) => set('anonymous', e.target.checked)} />
              <span>বেনামে অভিযোগ করতে চাই<small className="hint">নাম ও নম্বর জমা হবে না। তখন SMS যাবে না, ট্র্যাকিং আইডি লিখে রাখতে হবে।</small></span>
            </label>
            {!f.anonymous && (
              <div className="frow">
                <div className="field">
                  <label htmlFor="fName">আপনার নাম (ঐচ্ছিক)</label>
                  <input type="text" id="fName" maxLength={80} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} {...inv('name')} /><E k="name" />
                </div>
                <div className="field">
                  <label htmlFor="fPhone">মোবাইল নম্বর <span className="req">*</span></label>
                  <input type="tel" id="fPhone" inputMode="numeric" maxLength={16} placeholder="০১XXXXXXXXX" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} {...inv('phone')} /><E k="phone" />
                </div>
              </div>
            )}
            {needOtp && (
              <div className="otp" data-f="otp" tabIndex={-1}>
                <p className="hint" style={{ margin: 0 }}>এই অভিযোগ বক্সে মোবাইল নম্বর যাচাই করা বাধ্যতামূলক।</p>
                {otp.ticket ? <p className="okmsg">নম্বর যাচাই হয়েছে।</p> : <>
                  <div className="otp-row">
                    <button type="button" className="btn btn-line btn-sm" disabled={otp.busy} onClick={sendOtp}>{otp.sent ? 'আবার কোড পাঠান' : 'যাচাই কোড পাঠান'}</button>
                  </div>
                  {otp.sent && (
                    <div className="otp-row">
                      <div className="field"><label htmlFor="fOtp">৬ সংখ্যার কোড</label>
                        <input type="text" id="fOtp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value }))} /></div>
                      <button type="button" className="btn btn-brass btn-sm" disabled={otp.busy} onClick={verifyOtp}>যাচাই করুন</button>
                    </div>
                  )}
                </>}
                {otp.msg && !otp.ticket && <p className="hint" aria-live="polite">{otp.msg}</p>}
                <E k="otp" />
              </div>
            )}
            <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetKey={tsKey} />
            {privacyNote && <p className="privacy">{privacyNote}</p>}
            {alert && <p className="alert" role="alert">{alert}</p>}
            <div><button className="btn btn-brass" type="submit" disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'জমা হচ্ছে…' : 'অভিযোগ জমা দিন'}</button></div>
          </form>
        )}
      </div>

      <div id="pane-track" role="tabpanel" aria-labelledby="tab-track" hidden={tab !== 'track'}>
        <form className="track-form" noValidate onSubmit={(e) => { e.preventDefault(); void doTrack(trackId); }}>
          <label className="sr" htmlFor="trackId">ট্র্যাকিং আইডি</label>
          <input type="text" id="trackId" autoComplete="off" spellCheck={false} placeholder="যেমন: NDP3-2026-00012" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
          <button className="btn btn-brass" type="submit" disabled={track.busy}>অবস্থা দেখুন</button>
        </form>
        <div aria-live="polite">
          {track.err && <p className="err" style={{ marginTop: 14 }}>{track.err}</p>}
          {track.res && <TrackCard t={track.res} />}
        </div>
      </div>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [t, setT] = useState('আইডি কপি করুন');
  return <button type="button" className="btn btn-line" onClick={() => { try { navigator.clipboard.writeText(id).then(() => setT('কপি হয়েছে'), () => setT('আইডি নিজে লিখে রাখুন')); } catch { setT('আইডি নিজে লিখে রাখুন'); } }}>{t}</button>;
}

function TrackCard({ t }: { t: TrackResult }) {
  const s = COMPLAINT_STATUS[t.status] ?? COMPLAINT_STATUS.new!;
  const finished = t.status === 'solved' || t.status === 'closed';
  return (
    <div className="track-card" data-testid="track-card">
      <div className="tc-head">
        <div>
          <p className="tc-id">{t.trackingId}</p>
          <b>{t.category}</b>
          <p className="tc-meta">{joinParts([t.union, t.upazila])} · জমা: {bnDateSafe(t.submittedAt)}</p>
        </div>
        <span className="tpill" style={{ ['--c' as string]: s.c } as React.CSSProperties}>{s.t}</span>
      </div>
      <ol className="steps">
        {t.steps.map((st, i) => (
          <li key={i} className={i < t.steps.length - 1 || finished ? 'done' : 'now'}>
            <span className="dotc">{(i < t.steps.length - 1 || finished) && <IconCheck />}</span>
            <div><b>{st.label}</b><small>{joinParts([bnDateSafe(st.at), st.note])}</small></div>
          </li>
        ))}
        {!finished && <li><span className="dotc" /><div><b>সমাধান</b><small>অপেক্ষমাণ</small></div></li>}
      </ol>
    </div>
  );
}
