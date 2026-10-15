import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api.js';
import { useRegistry } from '../hooks/useRegistry.js';
import BackendBanner from '../components/BackendBanner.jsx';
import './Landing.css';

const SCAN_STEPS = [
  'Resolving host…',
  'Loading entry page…',
  'Tracing same-origin links…',
  'Watching for JavaScript errors…',
  'Checking first-party network…',
  'Building health report…',
];

function isLocalHost(host) {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

function normalizeUrl(raw) {
  const t = raw.trim().replace(/[,;.\s]+$/g, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  const bare = t.replace(/^\/\//, '');
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(bare)) {
    return `http://${bare}`;
  }
  return `https://${bare}`;
}

function localQuickPicks() {
  const port = window.location.port || '4177';
  return [
    {
      label: 'Defect fixture (demo)',
      url: `http://127.0.0.1:${port}/fixtures/defect-app/index.html`,
    },
    { label: 'This UI', url: `http://localhost:${port}/` },
    { label: 'Care (local)', url: 'http://localhost:3000' },
    { label: 'Guardian (local)', url: 'http://localhost:3003' },
  ];
}

export default function Landing() {
  const navigate = useNavigate();
  const { apiOnline } = useRegistry();
  const rootRef = useRef(null);
  const orbRefs = useRef([]);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.landing-hero-line', {
        y: 48,
        opacity: 0,
        duration: 1,
        stagger: 0.12,
        ease: 'power3.out',
      });
      gsap.from('.landing-card', {
        y: 32,
        opacity: 0,
        duration: 0.9,
        delay: 0.35,
        ease: 'power2.out',
      });
      gsap.from('.landing-pill', {
        scale: 0.8,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        delay: 0.5,
        ease: 'back.out(1.7)',
      });
      orbRefs.current.forEach((el, i) => {
        if (!el) return;
        gsap.to(el, {
          x: `random(-30, 30)`,
          y: `random(-20, 20)`,
          duration: 4 + i,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % SCAN_STEPS.length);
    }, 2200);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const scanLine = rootRef.current?.querySelector('.scan-line');
    if (!scanLine) return;
    const tween = gsap.fromTo(
      scanLine,
      { top: '8%' },
      { top: '88%', duration: 2.2, repeat: -1, ease: 'power1.inOut', yoyo: true },
    );
    return () => tween.kill();
  }, [phase]);

  async function handleScan(e) {
    e.preventDefault();
    setError('');
    const targetUrl = normalizeUrl(url);
    if (!targetUrl) {
      setError('Enter a valid URL to scan.');
      return;
    }
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      setError('That URL does not look valid.');
      return;
    }
    if (parsed.protocol === 'https:' && isLocalHost(parsed.hostname)) {
      setError('Local apps usually use http:// — try http://localhost with your port.');
      return;
    }

    if (apiOnline === false) {
      setError('Scan API is not connected on this host — configure VITE_API_BASE or use a full local stack (npm start).');
      return;
    }

    setPhase('running');
    setStepIndex(0);
    const scanStartedAt = performance.now();

    try {
      const body = {
        appId: 'adhoc-url-scan',
        environment: 'custom',
        inputMode: 'url',
        levels: [1],
        targetUrl,
      };
      const { runId: id } = await api('/api/runs', { method: 'POST', body: JSON.stringify(body) });
      setRunId(id);

      await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const j = await api(`/api/jobs/${id}`);
            if (j.status === 'completed') {
              clearInterval(poll);
              resolve(j);
            } else if (j.status === 'failed' || j.status === 'cancelled') {
              clearInterval(poll);
              reject(new Error(j.message || j.error || 'Scan failed'));
            }
          } catch (err) {
            clearInterval(poll);
            reject(err);
          }
        }, 450);
      });

      const minScanMs = 2800;
      const wait = Math.max(0, minScanMs - (performance.now() - scanStartedAt));
      if (wait) await new Promise((r) => setTimeout(r, wait));

      setPhase('done');
      gsap.to('.landing-card', { scale: 1.02, duration: 0.3, yoyo: true, repeat: 1 });
      setTimeout(() => navigate(`/reports/${id}`), 900);
    } catch (err) {
      setPhase('idle');
      setError(err.message || 'Scan could not complete.');
    }
  }

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing-bg" aria-hidden="true">
        <div className="orb orb-a" ref={(el) => { orbRefs.current[0] = el; }} />
        <div className="orb orb-b" ref={(el) => { orbRefs.current[1] = el; }} />
        <div className="orb orb-c" ref={(el) => { orbRefs.current[2] = el; }} />
        <div className="grid-glow" />
      </div>

      <header className="landing-top">
        <motion.div
          className="logo-mark"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="logo-dot" />
          Hubsteria Module Health
        </motion.div>
        <Link to="/overview" className="landing-dash-link">Open dashboard</Link>
      </header>

      <section className="landing-hero">
        <p className="landing-eyebrow landing-hero-line">Multi-app tester for Hubsteria</p>
        <h1 className="landing-title landing-hero-line">
          Paste a URL.
          <br />
          <span className="gradient-text">Know what to fix.</span>
        </h1>
        <p className="landing-sub landing-hero-line">
          Level 1 health checks with honest scope — links, errors, and first-party network. No fake
          “100%” claims from partial coverage.
        </p>

        <div className="landing-pills">
          {['Quick health', 'Broken links', 'JS errors', 'Actionable report'].map((label) => (
            <span key={label} className="landing-pill">{label}</span>
          ))}
        </div>

        {apiOnline === false && (
          <div className="landing-hero-line" style={{ maxWidth: 640, margin: '0 auto 1rem' }}>
            <BackendBanner apiOnline={apiOnline} />
          </div>
        )}

        <motion.form
          className="landing-card"
          onSubmit={handleScan}
          initial={false}
          animate={{ boxShadow: phase === 'running' ? '0 0 0 1px rgba(99,179,255,0.35), 0 24px 80px rgba(0,0,0,0.45)' : '0 24px 60px rgba(0,0,0,0.35)' }}
          transition={{ duration: 0.4 }}
        >
          <label className="landing-url-label" htmlFor="scan-url">Application URL</label>
          <div className="landing-local-chips" role="group" aria-label="Localhost shortcuts">
            {localQuickPicks().map((pick) => (
              <button
                key={pick.url}
                type="button"
                className="landing-local-chip"
                disabled={phase === 'running'}
                onClick={() => setUrl(pick.url)}
              >
                {pick.label}
              </button>
            ))}
          </div>
          <div className="landing-input-row">
            <motion.input
              id="scan-url"
              type="url"
              inputMode="url"
              placeholder="http://localhost:3000 or https://your-app.example.com"
              value={url}
              onChange={(ev) => setUrl(ev.target.value)}
              disabled={phase === 'running'}
              whileFocus={{ scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              autoComplete="url"
            />
            <motion.button
              type="submit"
              className="landing-scan-btn"
              disabled={phase === 'running' || apiOnline !== true}
              whileHover={{ scale: phase === 'running' ? 1 : 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              {phase === 'running' ? 'Scanning…' : 'Run health scan'}
            </motion.button>
          </div>
          {error && <p className="landing-error" role="alert">{error}</p>}

          <AnimatePresence mode="wait">
            {phase === 'running' && (
              <motion.div
                className="scan-stage"
                key="scan"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                <div className="scan-viewport" aria-live="polite">
                  <div className="scan-chrome">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="scan-body">
                    <div className="scan-line" />
                    <div className="scan-pulse" />
                    <motion.p
                      className="scan-status"
                      key={stepIndex}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      {SCAN_STEPS[stepIndex]}
                    </motion.p>
                  </div>
                </div>
                <div className="scan-progress-track">
                  <motion.div
                    className="scan-progress-fill"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
                  />
                </div>
                {runId && <p className="scan-run-id">Run {runId}</p>}
              </motion.div>
            )}
            {phase === 'done' && (
              <motion.p
                className="scan-done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Complete — opening report…
              </motion.p>
            )}
          </AnimatePresence>
        </motion.form>
      </section>

      <footer className="landing-foot">
        <span>HTML snapshot & deep workflows available in the dashboard.</span>
      </footer>
    </div>
  );
}
