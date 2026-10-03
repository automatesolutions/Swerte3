import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowRight, IconPlayerSkipForward, IconVolume, IconVolumeOff } from '@tabler/icons-react';
import { markIntroSeen, useSession } from '../state/session';
import { useToast } from '../components/Toast';
import { useReveal } from '../lib/motion';
import { logScreenView } from '../lib/analytics';

const REMOTE_CLIP = (import.meta.env.VITE_VIDEO_HOME_URL as string | undefined)?.trim();
const CLIPS = REMOTE_CLIP ? [REMOTE_CLIP] : ['/video/Video1.mp4', '/video/Video2.mp4', '/video/Video3.mp4', '/video/Video4.mp4'];

export function Welcome() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState(0);
  const [muted, setMuted] = useState(true);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [continuing, setContinuing] = useState(false);
  const inFlight = useRef(false);

  useReveal(scope);
  useEffect(() => logScreenView('Welcome'), []);

  const continueOn = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setContinuing(true);
    videoRef.current?.pause();
    markIntroSeen();
    const me = await refresh();
    inFlight.current = false;
    setContinuing(false);
    if (!me) {
      toast.show({
        tone: 'danger',
        title: "Couldn't start your session",
        body: 'The Swerte3 API did not answer. Confirm VITE_API_URL points at this project (not another app on port 8000), then select Continue again.',
      });
      return;
    }
    navigate('/', { replace: true });
  }, [navigate, refresh, toast]);

  // Browsers block autoplay with sound, so start muted and let the visitor turn sound on.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setState('loading');
    v.muted = muted;
    v.play().catch(() => {
      /* autoplay refused; the visitor can still press Continue */
    });
    const t = window.setTimeout(() => setState((s) => (s === 'loading' ? 'error' : s)), 20000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    v.volume = 1;
    setMuted(!muted);
    void v.play().catch(() => undefined);
  };

  return (
    <div className="welcome" ref={scope}>
      <div className="welcome__top">
        <span />
        <button type="button" className="btn btn--on-dark btn--sm" onClick={() => void continueOn()} disabled={continuing}>
          Skip intro <IconPlayerSkipForward size={16} aria-hidden />
        </button>
      </div>

      <main className="welcome__main">
        <div className="welcome__copy">
          <img src="/logo-384.webp" alt="Swerte3" width={132} height={132} data-reveal />
          <h1 data-reveal>Play smart. Stay lucky.</h1>
          <p data-reveal>
            Daily Swertres picks from two free models, plus Elite, a premium blend of several AI models. For fun, not a
            promise.
          </p>
          <div className="row" data-reveal>
            <button
              type="button"
              className="btn btn--gold btn--lg"
              onClick={() => void continueOn()}
              disabled={continuing}
              aria-busy={continuing}
            >
              {continuing ? <span className="spinner" aria-hidden /> : null}
              {continuing ? 'Starting your session…' : 'Continue'}
              {continuing ? null : <IconArrowRight size={20} aria-hidden />}
            </button>
          </div>
        </div>

        <div data-reveal>
          <div className="video-shell">
            {state !== 'error' ? (
              <video
                ref={videoRef}
                key={CLIPS[clip]}
                src={CLIPS[clip]}
                playsInline
                autoPlay
                muted={muted}
                preload="auto"
                onPlaying={() => setState('playing')}
                onError={() => setState('error')}
                onEnded={() => {
                  if (clip < CLIPS.length - 1) setClip(clip + 1);
                  else void continueOn();
                }}
                aria-label={`Swerte3 intro video, part ${clip + 1} of ${CLIPS.length}`}
              />
            ) : null}
            {state === 'loading' ? (
              <div className="video-shell__overlay" aria-live="polite">
                <span className="spinner" aria-hidden />
                <span>Loading intro…</span>
              </div>
            ) : null}
            {state === 'error' ? (
              <div className="video-shell__overlay">
                <strong>The intro video didn't load</strong>
                <span>You can still continue to the app.</span>
              </div>
            ) : null}
            {state === 'playing' ? (
              <button type="button" className="btn btn--on-dark btn--sm video-shell__sound" onClick={toggleSound}>
                {muted ? <IconVolumeOff size={18} aria-hidden /> : <IconVolume size={18} aria-hidden />}
                {muted ? 'Turn on sound' : 'Mute'}
              </button>
            ) : null}
          </div>
          {CLIPS.length > 1 ? (
            <div className="progress-dots" aria-label={`Part ${clip + 1} of ${CLIPS.length}`} role="img">
              {CLIPS.map((c, i) => (
                <span key={c} data-state={i < clip ? 'done' : i === clip ? 'now' : 'next'} />
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <p className="welcome__foot">For entertainment only. Not affiliated with PCSO. 18+</p>
    </div>
  );
}
