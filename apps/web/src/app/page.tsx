'use client';
import { useState, useMemo, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import dynamic from 'next/dynamic';

// ─── Vue 3D (Three.js) — chargée dynamiquement (no SSR) ───────────────────
const View3D = dynamic(() => import('./View3D'), {
  ssr: false,
  loading: () => null,
});
import {
  D, FF, GRID_COLS, GRID_ROWS, CENTER_X, CENTER_Y,
  TIER_SIZE, TIER_COLOR, TIER_LABEL, TIER_PRICE, PROFILES,
  buildStructuralGrid, buildDemoGrid, mergeGridWithBookings,
  isTierAvailable,
} from '../lib/grid'
import {
  isSupabaseConfigured, fetchActiveSlots,
  subscribeToBookings, createCheckoutSession,
  fetchSlotStats, submitBuyoutOffer, recordClick,
} from '../lib/supabase';
import { getSession, signIn, signUp, signOut } from '../lib/supabase-auth';
import { getT } from '../lib/i18n';

// ─── Language context ─────────────────────────────────────────
const LangContext = createContext('fr');
const LangSetterContext = createContext(() => {});
function useLang() { return useContext(LangContext); }
function useLangSetter() { return useContext(LangSetterContext); }
function useT() { const lang = useLang(); return getT(lang); }

// ── Inline lang toggle usable anywhere inside providers ──
function LangToggleInline() {
  const lang = useLang();
  const setLang = useLangSetter();
  return (
    <button
      onClick={() => setLang(l => l === 'fr' ? 'en' : 'fr')}
      style={{
        padding: '3px 8px',
        clipPath: 'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,0 100%)',
        background: 'transparent',
        border: `0.5px solid ${U.border}`,
        color: U.muted, fontFamily: F.mono,
        fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
        cursor: 'pointer', outline: 'none', transition: 'all 0.12s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = U.text; e.currentTarget.style.borderColor = `rgba(0,200,240,0.20)`; }}
      onMouseLeave={e => { e.currentTarget.style.color = U.muted; e.currentTarget.style.borderColor = `rgba(0,200,240,0.09)`; }}
    >
      {lang === 'fr' ? 'EN' : 'FR'}
    </button>
  );
}

// ─── UI Design System — STAR CITIZEN GRADE ─────────────────────
const U = {
  bg:      '#01020A',
  s1:      'rgba(0,4,16,0.98)',
  s2:      'rgba(0,8,24,0.97)',
  card:    'rgba(1,4,14,0.94)',
  border:  'rgba(0,200,240,0.09)',
  border2: 'rgba(0,200,240,0.20)',
  text:    '#DDE6F2',
  muted:   'rgba(140,180,220,0.70)',
  faint:   'rgba(0,200,240,0.04)',
  accent:  '#E8A020',
  accentFg:'#01020A',
  cyan:    '#00C8E4',
  violet:  '#8060C8',
  green:   '#00D880',
  rose:    '#D02848',
  err:     '#D02848',
};
const F = {
  h: "'Rajdhani','Sora',system-ui,sans-serif",
  b: "'Rajdhani','Sora',system-ui,sans-serif",
  mono: "'JetBrains Mono','Fira Code',monospace",
};

// ─── Theme categories ─────────────────────────────────────────
const THEMES = [
  { id: 'all',      labelKey: 'theme.all',      icon: '◈', color: null },
  { id: 'video',    labelKey: 'theme.video',    icon: '▶', color: '#e53935', match: (t,n)   => t === 'video' },
  { id: 'image',    labelKey: 'theme.image',    icon: '◻', color: '#8e24aa', match: (t,n)   => t === 'image' },
  { id: 'link',     labelKey: 'theme.link',     icon: '⌖', color: '#1e88e5', match: (t,n)   => t === 'link' },
  { id: 'social',   labelKey: 'theme.social',   icon: '⊕', color: '#00acc1', match: (t,n)   => ['snapchat','instagram','tiktok','x.com','twitter','facebook','linkedin','meta'].some(s => n?.toLowerCase().includes(s)) },
  { id: 'music',    labelKey: 'theme.music',    icon: '♪', color: '#1ed760', match: (t,n)   => ['spotify','music','apple music','deezer','soundcloud','artiste','artist'].some(s => n?.toLowerCase().includes(s)) },
  { id: 'app',      labelKey: 'theme.app',      icon: '⬡', color: '#43a047', match: (t,n,u) => t === 'app' || ['play.google','apps.apple'].some(s => u?.includes(s)) },
  { id: 'brand',    labelKey: 'theme.brand',    icon: '⬟', color: '#f0b429', match: (t,n)   => t === 'brand' },
  { id: 'clothing', labelKey: 'theme.clothing', icon: '◎', color: '#f4511e', match: (t,n)   => ['nike','adidas','mode','fashion','vetement','clothing','wear','zara','uniqlo'].some(s => n?.toLowerCase().includes(s)) },
  { id: 'lifestyle',labelKey: 'theme.lifestyle',icon: '❋', color: '#00bfa5', match: (t,n)   => ['airbnb','lifestyle','travel','voyage','food','wellness','yoga','sport'].some(s => n?.toLowerCase().includes(s)) },
  { id: 'publish',  labelKey: 'theme.publish',  icon: '≡', color: '#90a4ae', match: (t,n)   => t === 'text' },
];

function getSlotTheme(slot) {
  if (!slot.occ || !slot.tenant) return null;
  const { t, name, url } = slot.tenant;
  for (const th of THEMES) {
    if (th.id === 'all') continue;
    if (th.match?.(t, name, url)) return th;
  }
  return null;
}

// ─── Hooks ────────────────────────────────────────────────────

function useScreenSize() {
  // ✅ Fix hydration mismatch (#418): start with 0 (matches SSR),
  // then set real window value after mount in useEffect
  const [w, setW] = useState(0);
  useEffect(() => {
    setW(window.innerWidth);
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return { w, isMobile: w > 0 && w < 768 };
}

function useGridData() {
  const structuralGrid = useMemo(() => buildStructuralGrid(), []);
  const demoGrid       = useMemo(() => buildDemoGrid(), []);
  const [slots, setSlots]   = useState(demoGrid);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    fetchActiveSlots().then(({ data, error }) => {
      if (!error && data.length > 0) {
        setSlots(mergeGridWithBookings(structuralGrid, data)); setIsLive(true);
      } else if (!error && data.length === 0) {
        setSlots(structuralGrid.map(s => ({ ...s, occ: false, tenant: null, hot: false }))); setIsLive(true);
      }
      setLoading(false);
    });
  }, [structuralGrid]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const unsubscribe = subscribeToBookings(() => {
      fetchActiveSlots().then(({ data, error }) => {
        if (!error) { setSlots(mergeGridWithBookings(structuralGrid, data)); setIsLive(true); }
      });
    });
    return unsubscribe;
  }, [structuralGrid]);


  return { slots, isLive, loading };
}

// ─── Small Components ──────────────────────────────────────────────────────────

// ─── Waitlist Modal ────────────────────────────────────────────

function BrandLogo({ size = 20, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 9, transition: 'opacity .12s' }}>
      {/* Octagonal icon */}
      <div style={{
        width: size * 1.4, height: size * 1.4,
        clipPath: 'polygon(25% 0,75% 0,100% 25%,100% 75%,75% 100%,25% 100%,0 75%,0 25%)',
        background: `${U.accent}18`,
        border: `1px solid ${U.accent}${hov ? '88' : '44'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'all .12s',
        boxShadow: hov ? `0 0 14px ${U.accent}44` : 'none',
      }}>
        <span style={{ color: U.accent, fontSize: size * 0.9, lineHeight: 1 }}>◈</span>
      </div>
      <div>
        <div style={{ color: U.text, fontWeight: 700, fontSize: size * 0.95, letterSpacing: '.18em', fontFamily: F.h, lineHeight: 1, textTransform: 'uppercase' }}>
          ADS<span style={{ color: U.accent }}>Most</span>Fair
        </div>
        <div style={{ color: U.muted, fontFamily: F.mono, fontSize: size * 0.4, letterSpacing: '.20em', marginTop: 1, lineHeight: 1 }}>GALACTIC·ADV·GRID</div>
      </div>
    </button>
  );
}

function AnnouncementBar({ onWaitlist }) {
  const [visible, setVisible] = useState(true);
  const { isMobile } = useScreenSize();
  const t = useT();
  if (!visible) return null;
  return (
    <div style={{
      background: 'rgba(0,4,16,0.99)',
      borderBottom: `0.5px solid ${U.border}`,
      padding: isMobile ? '5px 12px' : '6px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, minHeight: 0,
      backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,200,240,0.02) 2px,rgba(0,200,240,0.02) 3px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, fontSize: isMobile ? 10 : 11, color: U.muted, overflow: 'hidden', fontFamily: F.mono }}>
        <span style={{
          background: `${U.accent}18`,
          border: `0.5px solid ${U.accent}44`,
          color: U.accent,
          fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', padding: '2px 8px',
          clipPath: 'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))',
          flexShrink: 0,
        }}>{t('banner.badge')}</span>
        {!isMobile && <span style={{ letterSpacing: '.06em' }}>{t('banner.text')}</span>}
        <button onClick={onWaitlist} style={{
          color: U.cyan, background: 'none', border: 'none', cursor: 'pointer',
          fontSize: isMobile ? 10 : 11, padding: 0, fontFamily: F.mono,
          whiteSpace: 'nowrap', letterSpacing: '.08em',
          textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2,
        }}>
          {t('banner.cta')}
        </button>
      </div>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: U.muted, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: .5 }}>×</button>
    </div>
  );
}

// ─── Modal Base ────────────────────────────────────────────────
function Modal({ onClose, width = 480, children, isMobile }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => { const fn = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [onClose]);
  const clip = 'polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px))';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,1,6,0.92)', backdropFilter: 'blur(20px) saturate(180%)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', opacity: entered ? 1 : 0, transition: 'opacity 0.2s ease' }}>
      {/* scanlines overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,200,240,0.025) 2px,rgba(0,200,240,0.025) 3px)', pointerEvents: 'none' }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: isMobile ? '100vw' : `min(96vw,${width}px)`,
          background: 'rgba(0,4,18,0.98)',
          border: `0.5px solid ${U.border2}`,
          clipPath: isMobile ? 'none' : clip,
          borderRadius: isMobile ? '16px 16px 0 0' : 0,
          overflow: 'hidden',
          maxHeight: isMobile ? '90vh' : '88vh',
          transform: entered ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: `0 0 80px ${U.cyan}14, 0 32px 80px rgba(0,0,0,0.95)`,
        }}
      >
        {/* Top energy bar */}
        <div style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${U.cyan},${U.cyan}88,transparent)`, boxShadow: `0 0 8px ${U.cyan}` }} />
        {/* Corner brackets */}
        {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],i) => (
          <div key={i} style={{ position: 'absolute', [v]: 6, [h]: 6, width: 10, height: 10,
            borderTop: v==='top' ? `1px solid ${U.cyan}66` : 'none',
            borderBottom: v==='bottom' ? `1px solid ${U.cyan}66` : 'none',
            borderLeft: h==='left' ? `1px solid ${U.cyan}66` : 'none',
            borderRight: h==='right' ? `1px solid ${U.cyan}66` : 'none',
            pointerEvents: 'none', zIndex: 10,
          }} />
        ))}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 12, width: 24, height: 24,
          clipPath: 'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))',
          border: `0.5px solid ${U.rose}33`, background: 'transparent',
          color: `${U.rose}88`, cursor: 'pointer', fontSize: 11, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .10s', fontFamily: F.mono,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = U.rose; e.currentTarget.style.borderColor = `${U.rose}66`; }}
          onMouseLeave={e => { e.currentTarget.style.color = `${U.rose}88`; e.currentTarget.style.borderColor = `${U.rose}33`; }}>✕</button>
        {children}
      </div>
    </div>
  );
}

function WaitlistModal({ onClose }) {
  const { isMobile } = useScreenSize();
  const t = useT();
  const [email, setEmail]     = useState('');
  const [profile, setProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [already, setAlready] = useState(false);
  const [error, setError]     = useState(null);

  const handleSubmit = async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), profile }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur serveur'); return; }
      if (data.already) setAlready(true);
      setDone(true);
    } catch {
      setError('Erreur réseau, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const inpStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 9,
    background: U.faint, border: `1px solid ${U.border}`,
    color: U.text, fontSize: 14, fontFamily: F.b, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  };

  return (
    <Modal onClose={onClose} width={480} isMobile={isMobile}>
      <div style={{ padding: isMobile ? '28px 20px 36px' : '40px 40px 44px' }}>

        {!done ? (<>
          {/* ── Header ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: U.accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>ACCÈS PRIORITAIRE</div>
            <h2 style={{ color: U.text, fontWeight: 800, fontSize: 22, fontFamily: F.h, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
              {t('waitlist.title')}
            </h2>
            <p style={{ color: U.muted, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
              {t('waitlist.body')}
            </p>
          </div>

          {/* ── Profil ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 10 }}>VOUS ÊTES</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {Object.entries(PROFILES).map(([id, p]) => {
                const active = profile === id;
                const col    = p.color || U.accent;
                return (
                  <button key={id}
                    onClick={() => setProfile(id)}
                    style={{
                      flex: 1, padding: '9px 6px', borderRadius: 9, cursor: 'pointer',
                      fontFamily: F.b, textAlign: 'center', transition: 'all 0.15s',
                      background: active ? `${col}15` : U.faint,
                      border: `1px solid ${active ? col + '50' : U.border}`,
                      color: active ? col : U.muted,
                    }}
                  >
                    <div style={{ fontSize: 16, marginBottom: 3 }}>{p.icon || '◈'}</div>
                    <div style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{p.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Email ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 8 }}>EMAIL</div>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="votre@email.com"
              style={inpStyle}
              onFocus={e => e.target.style.borderColor = U.border2}
              onBlur={e => e.target.style.borderColor = U.border}
            />
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: `${U.err}12`, border: `1px solid ${U.err}30`, color: U.err, fontSize: 12, marginBottom: 10, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit} disabled={loading}
            style={{
              width: '100%', padding: '13px', marginTop: 6,
              borderRadius: 10, fontFamily: F.b,
              cursor: loading ? 'wait' : 'pointer',
              background: loading ? U.s2 : U.accent,
              border: 'none', color: loading ? U.muted : U.accentFg,
              fontWeight: 700, fontSize: 14,
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? 'none' : `0 0 22px ${U.accent}45`,
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Inscription…' : "Rejoindre la liste d'attente →"}
          </button>
          <div style={{ marginTop: 12, color: U.muted, fontSize: 11, textAlign: 'center' }}>
            {t('waitlist.nospam')}
          </div>

        </>) : (
          /* ── État success ── */
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <div style={{ fontSize: 44, marginBottom: 14, animation: 'fadeIn 0.4s ease' }}>
              {already ? '👋' : '✦'}
            </div>
            <h2 style={{ color: U.text, fontFamily: F.h, fontSize: 22, margin: '0 0 12px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              {already ? 'Vous êtes déjà inscrit !' : 'Vous êtes sur la liste !'}
            </h2>
            <p style={{ color: U.muted, fontSize: 13, lineHeight: 1.7, margin: '0 0 10px' }}>
              {already
                ? <>L'adresse <strong style={{ color: U.text }}>{email}</strong> est déjà enregistrée.<br />Vous serez notifié dès l'ouverture.</>
                : <>Confirmation envoyée à <strong style={{ color: U.text }}>{email}</strong>.<br />Nous vous contacterons dès que votre accès est disponible.</>
              }
            </p>
            {/* Badges tier dispo */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '20px 0' }}>
              {[['VIRAL','#00e8a2'],['BUSINESS','#00d9f5'],['PRESTIGE','#ff4d8f'],['ÉPICENTRE','#f0b429']].map(([l,c]) => (
                <div key={l} style={{ padding: '3px 9px', borderRadius: 4, background: `${c}15`, border: `1px solid ${c}30`, color: c, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em' }}>{l}</div>
              ))}
            </div>
            <button
              onClick={onClose}
              style={{ padding: '11px 32px', borderRadius: 10, fontFamily: F.b, cursor: 'pointer', background: U.accent, border: 'none', color: U.accentFg, fontWeight: 700, fontSize: 14, boxShadow: `0 0 18px ${U.accent}40` }}
            >
              Explorer la grille
            </button>
          </div>
        )}

      </div>
    </Modal>
  );
}

function BoostModal({ onClose }) {
  const { isMobile } = useScreenSize();
  const t = useT();
  const [hours, setHours] = useState(3);
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const total = hours;

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) { setError('Email invalide'); return; }
    if (!url || !url.startsWith('http')) { setError('URL invalide (ex: https://monsite.com)'); return; }
    if (!name.trim()) { setError('Nom requis'); return; }
    setLoading(true); setError(null);
    try {
      await fetch('/api/offers/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'boost', hours, email, url, name, totalCents: total * 100 }),
      });
      setSent(true);
    } catch {
      setError('Erreur réseau, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} width={460} isMobile={isMobile}>
      <div style={{ padding: isMobile ? '24px 20px 32px' : '36px 36px 40px' }}>
        {!sent ? (<>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 4, background: `${U.accent}18`, border: `1px solid ${U.accent}40`, color: U.accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 12 }}>
              ⚡ BOOST SPOTLIGHT
            </div>
            <h2 style={{ color: U.text, fontWeight: 700, fontSize: 20, fontFamily: F.h, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Mettre votre bloc en avant</h2>
            <p style={{ color: U.muted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>Votre marque défile dans la <strong style={{ color: U.text }}>barre de diffusion</strong> en haut de l'Explorer, visible par tous les visiteurs. <strong style={{ color: U.text }}>1€/heure</strong>, sans engagement.</p>
          </div>

          {/* Duration picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 10 }}>DURÉE</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 3, 6, 12, 24].map(h => (
                <button key={h} onClick={() => setHours(h)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: F.b, background: hours === h ? `${U.accent}15` : U.faint, border: `1px solid ${hours === h ? U.accent + '55' : U.border}`, color: hours === h ? U.accent : U.muted, fontWeight: hours === h ? 700 : 400, fontSize: 12, transition: 'all 0.15s' }}>
                  {h}h
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>€{h}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          {[
            ['Votre nom / marque', name, setName, 'text', 'Nike, StartupXYZ…'],
            ['URL de destination', url, setUrl, 'url', 'https://monsite.com'],
            ['Email de contact', email, setEmail, 'email', 'vous@email.com'],
          ].map(([label, val, setter, type, ph]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 8 }}>{label.toUpperCase()}</div>
              <input
                type={type} value={val} onChange={e => setter(e.target.value)}
                placeholder={ph}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 8, background: U.faint, border: `1px solid ${U.border}`, color: U.text, fontSize: 13, fontFamily: F.b, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = U.border2}
                onBlur={e => e.target.style.borderColor = U.border}
              />
            </div>
          ))}

          {/* Summary */}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: `${U.accent}08`, border: `1px solid ${U.accent}25`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: U.muted, fontSize: 13 }}>{hours}h × 1€/h</span>
            <span style={{ color: U.accent, fontWeight: 700, fontSize: 20, fontFamily: F.h }}>€{total}</span>
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: `${U.err}12`, border: `1px solid ${U.err}30`, color: U.err, fontSize: 12, marginBottom: 14, textAlign: 'center' }}>{error}</div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 10, fontFamily: F.b, cursor: loading ? 'wait' : 'pointer', background: U.accent, border: 'none', color: U.accentFg, fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1, boxShadow: `0 0 22px ${U.accent}45`, transition: 'opacity 0.15s' }}>
            {loading ? 'Envoi…' : `Lancer le boost — €${total}`}
          </button>
          <div style={{ marginTop: 10, color: U.muted, fontSize: 11, textAlign: 'center' }}>Paiement sécurisé · Activation sous 1h · Annulation libre</div>
        </>) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
            <h2 style={{ color: U.text, fontFamily: F.h, fontSize: 22, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Boost reçu !</h2>
            <p style={{ color: U.muted, fontSize: 13, lineHeight: 1.7, margin: '0 0 24px' }}>Votre demande a été transmise.<br />Vous recevrez les instructions de paiement par email sous peu.</p>
            <button onClick={onClose} style={{ padding: '11px 28px', borderRadius: 10, fontFamily: F.b, cursor: 'pointer', background: U.accent, border: 'none', color: U.accentFg, fontWeight: 700, fontSize: 14 }}>Fermer</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function BlockPreview({ tier, blockForm, category, CATS, SOCIALS, MUSIC_PLATS }) {
  const cat         = CATS.find(c => c.id === category) || CATS[2];
  const selSocial   = SOCIALS.find(s => s.id === blockForm.social_network);
  const selMusic    = MUSIC_PLATS.find(p => p.id === blockForm.music_platform);
  const blockColor  = blockForm.primary_color || selSocial?.color || selMusic?.color || cat.color;
  const bgColor     = blockForm.background_color || '#0d1828';
  const hasImage    = !!blockForm.image_url;
  const logoInitial = (blockForm.title || '?').charAt(0).toUpperCase();
  const c           = TIER_COLOR[tier];

  // Tailles de preview
  const PREVIEW_SZ  = 160;   // bloc agrandi pour la colonne preview
  const REAL_SZ     = TIER_SIZE[tier] || 11;
  const r_preview   = tier === 'epicenter' ? 16 : tier === 'prestige' || tier === 'elite' ? 14 : tier === 'business' ? 5 : 3;
  const r_real      = tier === 'epicenter' ? Math.round(REAL_SZ * 0.1) : tier === 'prestige' || tier === 'elite' ? Math.round(REAL_SZ * 0.09) : tier === 'business' ? 3 : 2;

  // Label plateforme
  const platformLabel = selSocial?.label || selMusic?.label || null;

  // Render du contenu interne — même logique que BlockMedia
  function BlockContent({ sz }) {
    const t = category;
    const img = blockForm.image_url || '';
    const c = blockColor;
    const b = bgColor;
    const l = logoInitial;
    const name = blockForm.title || '';
    const slogan = blockForm.slogan || '';
    const social = blockForm.social_network || '';
    const music = blockForm.music_platform || '';
    const appStore = blockForm.app_store || '';

    if (t === 'video') {
      const btnSz = Math.min(sz * 0.42, 32);
      return (
        <div style={{ position:'absolute', inset:0, overflow:'hidden', background:b }}>
          {img && <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.55 }} onError={e=>e.target.style.display='none'} />}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6))' }} />
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3 }}>
            <div style={{ width:btnSz, height:btnSz, borderRadius:'50%', background:'rgba(0,0,0,0.6)', border:`${Math.max(1,btnSz*0.06)}px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', boxShadow:`0 0 ${btnSz*0.6}px ${c}70, 0 0 ${btnSz*1.2}px ${c}30` }}>
              <span style={{ color:c, fontSize:Math.max(8,btnSz*0.38), lineHeight:1, paddingLeft:'12%' }}>▶</span>
            </div>
            {sz>=52&&name&&<span style={{ color:'rgba(255,255,255,0.85)', fontSize:Math.min(sz*0.1,9), fontWeight:700, textAlign:'center', maxWidth:'85%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>}
          </div>
        </div>
      );
    }
    if (img && (t === 'image' || t === 'lifestyle' || t === 'brand' || t === 'clothing')) {
      return (
        <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
          <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'} />
          {t==='lifestyle'&&<div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }}>{sz>=52&&name&&<div style={{ position:'absolute', bottom:4, left:4, right:4, color:'#fff', fontSize:Math.min(sz*0.1,9), fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>}</div>}
          {t==='brand'&&<div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${b} 0%, transparent 55%)` }} />}
          {t==='clothing'&&slogan&&sz>=26&&<div style={{ position:'absolute', bottom:3, right:3, padding:'2px 6px', borderRadius:3, background:'rgba(0,0,0,0.82)', color:'#fff', fontSize:Math.min(sz*0.11,10), fontWeight:800, backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)' }}>{slogan.slice(0,14)}</div>}
        </div>
      );
    }
    if (t === 'social') {
      const icon = SOCIAL_ICONS_MAP[social] || selSocial?.e || '⊕';
      const col  = SOCIAL_COLORS_MAP[social] || c;
      return (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, padding:2, overflow:'hidden',
          background:`radial-gradient(circle at 50% 45%, ${col}28 0%, ${col}0a 55%, ${b} 100%)` }}>
          {sz>=11&&<span style={{ fontSize:Math.min(sz*0.52,36), lineHeight:1, filter:`drop-shadow(0 0 ${Math.min(sz*0.15,8)}px ${col}90)` }}>{icon}</span>}
          {sz>=44&&name&&<span style={{ color:col, fontSize:Math.min(sz*0.1,9), fontWeight:700, textAlign:'center', maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>{name}</span>}
        </div>
      );
    }
    if (t === 'music') {
      const icon = MUSIC_ICONS_MAP[music] || selMusic?.e || '🎵';
      const col  = MUSIC_COLORS_MAP[music] || c;
      const bars=[0.55,1,0.7,0.9,0.45,0.8]; const barH=Math.min(sz*0.2,16); const barW=Math.max(1.5,sz*0.038);
      return (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:Math.max(1,sz*0.04), padding:2, overflow:'hidden',
          background:`radial-gradient(ellipse at 50% 35%, ${col}22 0%, ${col}05 60%, ${b} 100%)` }}>
          {sz>=11&&<span style={{ color:col, fontSize:Math.min(sz*0.46,30), lineHeight:1, fontWeight:900, filter:`drop-shadow(0 0 ${Math.min(sz*0.12,6)}px ${col}80)` }}>{icon}</span>}
          {sz>=28&&<div style={{ display:'flex', alignItems:'flex-end', gap:Math.max(1,barW*0.4), height:barH }}>{bars.map((h,i)=><div key={i} style={{ width:barW, borderRadius:barW, background:col, height:barH*h, animation:`eqBar${i%5} ${0.38+i*0.11}s ease-in-out infinite alternate`, boxShadow:`0 0 ${barW*1.5}px ${col}70` }} />)}</div>}
          {sz>=52&&name&&<span style={{ color:col+'cc', fontSize:Math.min(sz*0.09,8), fontWeight:700, textAlign:'center', maxWidth:'92%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>}
        </div>
      );
    }
    if (t === 'app') {
      const storeCol = APP_STORE_COLORS[appStore] || c;
      const storeLbl = appStore==='app_store'?'🍎':appStore==='google_play'?'▶':'🌐';
      const iconSz=Math.min(sz*0.54,40);
      return (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:Math.max(1,sz*0.04), padding:3, background:`${storeCol}0a`, overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 40%, ${storeCol}18 0%, transparent 65%)` }} />
          {img?<img src={img} alt="" style={{ width:iconSz, height:iconSz, borderRadius:iconSz*0.22, objectFit:'cover', border:`1.5px solid ${storeCol}40`, boxShadow:`0 ${iconSz*0.08}px ${iconSz*0.3}px rgba(0,0,0,0.5)`, position:'relative' }} onError={e=>e.target.style.display='none'} />
              :sz>=20&&<div style={{ width:iconSz, height:iconSz, borderRadius:iconSz*0.22, background:`${storeCol}22`, border:`1.5px solid ${storeCol}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:iconSz*0.42, fontWeight:900, color:storeCol, fontFamily:F.h, position:'relative' }}>{l}</div>}
          {sz>=26&&<div style={{ position:'relative', display:'flex', alignItems:'center', gap:2, padding:`${Math.max(1,sz*0.03)}px ${Math.max(2,sz*0.06)}px`, borderRadius:Math.max(2,sz*0.04), background:`${storeCol}20`, border:`1px solid ${storeCol}40` }}>
            <span style={{ fontSize:Math.min(sz*0.12,9), lineHeight:1 }}>{storeLbl}</span>
            {sz>=44&&<span style={{ color:storeCol, fontSize:Math.min(sz*0.09,8), fontWeight:700 }}>{appStore==='app_store'?'App Store':appStore==='google_play'?'Google Play':'Web'}</span>}
          </div>}
        </div>
      );
    }
    if (t === 'text') {
      const pad=Math.max(3,sz*0.08);
      return (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'center', padding:pad, background:b, overflow:'hidden' }}>
          {sz>=20&&<div style={{ width:'45%', height:Math.max(1,sz*0.025), background:`linear-gradient(90deg, ${c}80, ${c}20)`, marginBottom:Math.max(2,sz*0.05), borderRadius:1 }} />}
          {sz>=24&&<div style={{ color:c, fontSize:Math.min(sz*0.14,11), fontWeight:800, lineHeight:1.25, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:sz>=56?3:2, WebkitBoxOrient:'vertical', letterSpacing:'-0.01em' }}>{name||'Votre publication'}</div>}
          {sz>=64&&slogan&&<div style={{ color:`${c}60`, fontSize:Math.min(sz*0.09,8), marginTop:sz*0.04, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{slogan}</div>}
          {sz>=30&&<div style={{ width:'28%', height:Math.max(1,sz*0.02), background:`linear-gradient(90deg, ${c}40, transparent)`, marginTop:Math.max(2,sz*0.05), borderRadius:1 }} />}
        </div>
      );
    }
    if (img) return <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'} />;
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, padding:3, background:bgColor, overflow:'hidden' }}>
        <span style={{ color:blockColor, fontSize:Math.min(sz*0.36,42), fontWeight:900, lineHeight:1, fontFamily:F.h }}>{selSocial?.e||selMusic?.e||cat.icon||logoInitial}</span>
        {sz>=52&&name&&<span style={{ color:blockColor+'cc', fontSize:Math.min(sz*0.12,13), fontWeight:700, textAlign:'center', lineHeight:1.2, maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>

      {/* ── Label "APERÇU EN DIRECT" ── */}
      <div style={{ display:'flex', alignItems:'center', gap:7, alignSelf:'flex-start' }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:'#00e8a2', animation:'blink 1.5s infinite' }} />
        <span style={{ fontSize:9, fontWeight:800, color:'#00e8a2', letterSpacing:'0.1em' }}>APERÇU EN DIRECT</span>
      </div>

      {/* ── Grande vue ── */}
      <div style={{ position:'relative', width:PREVIEW_SZ, height:PREVIEW_SZ }}>
        {/* Halo tier */}
        <div style={{
          position:'absolute', inset:-8, borderRadius:r_preview+6,
          boxShadow:`0 0 40px ${blockColor}30, 0 0 80px ${blockColor}12`,
          pointerEvents:'none',
        }} />
        {/* Bloc principal */}
        <div style={{
          width:PREVIEW_SZ, height:PREVIEW_SZ,
          borderRadius:r_preview,
          position:'relative', overflow:'hidden',
          border:`1.5px solid ${blockColor}55`,
          background:bgColor,
          boxShadow:`0 0 0 1px ${blockColor}25, 0 8px 32px rgba(0,0,0,0.5)`,
        }}>
          <BlockContent sz={PREVIEW_SZ} />
          {/* Badge catégorie en surimpression */}
          <div style={{ position:'absolute', bottom:8, left:8, right:8, display:'flex', justifyContent:'space-between', alignItems:'flex-end', zIndex:3 }}>
            {blockForm.slogan && (
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', fontWeight:500, lineHeight:1.3, maxWidth:'70%', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                {blockForm.slogan}
              </div>
            )}
            <div style={{ fontSize:8, fontWeight:800, color:blockColor, padding:'2px 6px', background:`${blockColor}18`, borderRadius:3, border:`1px solid ${blockColor}35`, flexShrink:0 }}>
              {cat.label.toUpperCase()}
            </div>
          </div>
          {/* Overlay gradient bas */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60, background:`linear-gradient(to top, ${bgColor}cc, transparent)`, pointerEvents:'none' }} />
        </div>

        {/* Badge LIVE en haut à droite */}
        <div style={{ position:'absolute', top:-8, right:-8, display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:20, background:'rgba(0,0,0,0.85)', border:`1px solid ${c}30`, backdropFilter:'blur(8px)' }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#00e8a2', animation:'blink 1.5s infinite' }} />
          <span style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.7)', letterSpacing:'0.06em' }}>LIVE</span>
        </div>
      </div>

      {/* ── Vue "contexte grille" — taille réelle entourée de voisins ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'center', width:'100%' }}>
        <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', letterSpacing:'0.06em', fontWeight:600 }}>TAILLE RÉELLE SUR LA GRILLE</div>
        <div style={{
          padding:12,
          borderRadius:10,
          background:'#0a0a0a',
          border:`1px solid ${U.border}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:3,
          position:'relative',
          overflow:'hidden',
        }}>
          {/* Grille de voisins simulés */}
          {[0,1,2,3,4,5,6,7,8].map(i => {
            const isCenter = i === 4;
            const sz = REAL_SZ;
            return (
              <div key={i} style={{ display: i % 3 === 0 && i > 0 ? 'none' : 'block' }}>
                {i % 3 === 0 && i > 0 ? null : (
                  <div style={{
                    width:sz, height:sz,
                    borderRadius:r_real,
                    background:isCenter ? bgColor : U.s2,
                    border:`1px solid ${isCenter ? blockColor+'55' : U.border}`,
                    position:'relative', overflow:'hidden',
                    boxShadow: isCenter ? `0 0 ${sz*1.5}px ${blockColor}40` : 'none',
                    flexShrink:0,
                  }}>
                    {isCenter && <BlockContent sz={sz} />}
                    {!isCenter && sz >= 6 && (
                      <div style={{ position:'absolute', inset:0, background:`${c}04` }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Vraie vue contexte grille en ligne ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:4, width:'100%' }}>
        <div style={{
          padding:'8px 10px',
          borderRadius:8,
          background:'#0a0a0a',
          border:`1px solid ${U.border}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:2,
          overflow:'hidden',
        }}>
          {Array.from({length:7}, (_,i) => {
            const isCenter = i === 3;
            const sz = REAL_SZ;
            return (
              <div key={i} style={{
                width:sz, height:sz,
                borderRadius:r_real,
                flexShrink:0,
                background:isCenter ? bgColor : (i % 2 === 0 ? U.s2 : '#0d0d0d'),
                border:`1px solid ${isCenter ? blockColor+'60' : U.border}`,
                position:'relative', overflow:'hidden',
                transition:'all 0.2s',
                boxShadow: isCenter ? `0 0 ${Math.max(4, sz)}px ${blockColor}50` : 'none',
              }}>
                {isCenter && <BlockContent sz={sz} />}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize:8, color:'rgba(255,255,255,0.18)', textAlign:'center', fontWeight:500 }}>
          Simulation de voisinage sur la grille publique
        </div>
      </div>

      {/* ── Infos recap ── */}
      <div style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:`${c}08`, border:`1px solid ${c}20` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div style={{ display:'inline-block', padding:'2px 7px', borderRadius:4, background:`${c}15`, border:`1px solid ${c}30`, color:c, fontSize:9, fontWeight:800, letterSpacing:'0.06em' }}>{TIER_LABEL[tier]}</div>
          {platformLabel && (
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>{platformLabel}</div>
          )}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', lineHeight:1.5 }}>
          <span style={{ color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{blockForm.title || '—'}</span>
          {blockForm.slogan && <span> · {blockForm.slogan}</span>}
        </div>
      </div>

    </div>
  );
}

// ─── Duration billing helper (mirrors View3D DurationPicker logic) ──────────
function getBilling(days) {
  if (days >= 90) return { type:'annuel',   label:'ANNUEL',       icon:'◈', discount:0.15, color:U.accent,  desc:'−15% · engagement 90j' };
  if (days >= 30) return { type:'mensuel',  label:'MENSUEL',      icon:'◎', discount:0.10, color:U.cyan,    desc:'−10% · engagement 30j+' };
  if (days >= 7)  return { type:'hebdo',    label:'HEBDOMADAIRE', icon:'▣', discount:0.05, color:U.violet,  desc:'−5% · engagement 7j+' };
  return                 { type:'comptant', label:'COMPTANT',     icon:'▪', discount:0,    color:U.muted,   desc:'Paiement unique' };
}

function CheckoutModal({ slot, onClose }) {
  const { isMobile } = useScreenSize();
  const t = useT();
  const [step, setStep]       = useState(0); // 0=auth, 1=contenu, 2=paiement
  const [email, setEmail]     = useState('');
  const [authMode, setAuthMode]   = useState('login'); // 'login' | 'signup'
  const [authName, setAuthName]   = useState('');
  const [authPass, setAuthPass]   = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Vérifie session au montage — saute l'étape auth si déjà connecté
  useEffect(() => {
    getSession().then(session => {
      if (session?.user?.email) {
        setEmail(session.user.email);
        setStep(1);
      }
      setAuthLoading(false);
    });
  }, []);

  const handleAuth = async () => {
    if (!email.includes('@')) { setAuthError('Email invalide'); return; }
    if (!authPass || authPass.length < 6) { setAuthError('Mot de passe : 6 caractères minimum'); return; }
    setAuthLoading(true); setAuthError('');
    try {
      if (authMode === 'signup') {
        await signUp({ email, password: authPass, displayName: authName || email.split('@')[0] });
      } else {
        await signIn({ email, password: authPass });
      }
      setStep(1);
    } catch (err) {
      setAuthError(
        err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' :
        err.message === 'User already registered'   ? 'Compte existant. Connectez-vous.' :
        err.message
      );
    } finally { setAuthLoading(false); }
  };
  const [days, setDays]       = useState(() => slot?.days || 30);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  // Contenu du bloc
  const [category, setCategory] = useState('link');
  const [imgMode, setImgMode] = useState('url'); // 'url' | 'upload'
  const [imgUploading, setImgUploading] = useState(false);
  const [blockForm, setBlockForm] = useState({
    title: '', slogan: '', url: '', cta_text: 'Visiter',
    image_url: '', primary_color: '', background_color: '#0d1828',
    social_network: '', music_platform: '', app_store: 'web',
  });

  const tier = slot?.tier;
  const pricePerDay = priceEur(tier) || 1;
  const billing     = getBilling(days);
  const rawPrice    = pricePerDay * days;
  const totalPrice  = Math.round(rawPrice * (1 - billing.discount));
  const savings     = rawPrice - totalPrice;
  const c = TIER_COLOR[tier];

  const CATS = [
    { id:'video',    label:'Vidéo',      icon:'▶', color:'#e53935',
      titleLabel:'TITRE / CHAÎNE',      titlePh:'Ex: MaChaine — Ep.12',
      sloganLabel:'CRÉATEUR / GENRE',   sloganPh:'Ex: Tech & Gaming · 50k abonnés',
      urlLabel:'LIEN YOUTUBE / VIMEO',  urlPh:'https://youtube.com/watch?v=…',
      ctaDefault:'Regarder',            showImg:true,  showSocial:false, showMusic:false, showApp:false,
      hint:`L'embed vidéo s'affichera directement dans le popup.` },
    { id:'image',    label:'Image',      icon:'◻', color:'#8e24aa',
      titleLabel:'VOTRE NOM / MARQUE',  titlePh:'Ex: Studio Créatif',
      sloganLabel:'ACCROCHE',           sloganPh:'Ex: Portraits & identités visuelles',
      urlLabel:'LIEN DESTINATION',      urlPh:'https://votresite.com',
      ctaDefault:'Découvrir',           showImg:true,  showSocial:false, showMusic:false, showApp:false,
      hint:`L'image remplit entièrement le bloc.` },
    { id:'link',     label:'Lien',       icon:'⌖', color:'#1e88e5',
      titleLabel:'TITRE DU LIEN',       titlePh:'Ex: Mon site portfolio',
      sloganLabel:'DESCRIPTION',        sloganPh:'Ex: Design & développement web',
      urlLabel:'URL DESTINATION',       urlPh:'https://votresite.com',
      ctaDefault:'Visiter',             showImg:false, showSocial:false, showMusic:false, showApp:false,
      hint:'Le bloc affiche vos initiales et votre nom.' },
    { id:'social',   label:'Réseaux',    icon:'⊕', color:'#00acc1',
      titleLabel:'VOTRE NOM',           titlePh:'Ex: @votrepseudo',
      sloganLabel:'BIO / DESCRIPTION',  sloganPh:'Ex: Créateur de contenu · Paris',
      urlLabel:'LIEN DU PROFIL',        urlPh:'https://instagram.com/votrepseudo',
      ctaDefault:'Suivre',              showImg:false, showSocial:true,  showMusic:false, showApp:false,
      hint:`L'icône de la plateforme s'affiche sur le bloc.` },
    { id:'music',    label:'Musique',    icon:'♪', color:'#1ed760',
      titleLabel:'ARTISTE / TITRE',     titlePh:'Ex: MaMusique — Album 2025',
      sloganLabel:'GENRE / STYLE',      sloganPh:'Ex: Hip-hop · R&B · Lo-fi',
      urlLabel:"LIEN D'ÉCOUTE",         urlPh:'https://open.spotify.com/track/…',
      ctaDefault:'Écouter',             showImg:true,  showSocial:false, showMusic:true,  showApp:false,
      hint:`Un lecteur audio s'intègre dans le popup (Spotify, SoundCloud, YouTube).` },
    { id:'app',      label:'App',        icon:'⬡', color:'#43a047',
      titleLabel:"NOM DE L'APP",        titlePh:'Ex: MonApp — Todo & Focus',
      sloganLabel:'NOTE / ACCROCHE',    sloganPh:'Ex: 4.8★ · 10k+ téléchargements',
      urlLabel:"LIEN STORE / SITE",     urlPh:'https://apps.apple.com/…',
      ctaDefault:'Télécharger',         showImg:true,  showSocial:false, showMusic:false, showApp:true,
      hint:`L'icône de l'app est affichée arrondie, style App Store.` },
    { id:'brand',    label:'Marque',     icon:'⬟', color:'#f0b429',
      titleLabel:'NOM DE LA MARQUE',    titlePh:'Ex: MaMarque™',
      sloganLabel:'TAGLINE',            sloganPh:`Ex: L'excellence depuis 2010`,
      urlLabel:'SITE WEB',              urlPh:'https://votremarque.com',
      ctaDefault:'Découvrir',           showImg:true,  showSocial:false, showMusic:false, showApp:false,
      hint:`Le logo s'affiche centré sur fond couleur marque.` },
    { id:'clothing', label:'Vêtements', icon:'◎', color:'#f4511e',
      titleLabel:'NOM DE LA BOUTIQUE',  titlePh:'Ex: UrbanWear',
      sloganLabel:'PRIX / ACCROCHE',    sloganPh:'Ex: À partir de 29€',
      urlLabel:'LIEN COLLECTION',       urlPh:'https://boutique.com/collection',
      ctaDefault:'Voir la collection',  showImg:true,  showSocial:false, showMusic:false, showApp:false,
      hint:`Le prix s'affiche en badge sur la photo produit.` },
    { id:'lifestyle',label:'Lifestyle', icon:'❋', color:'#00bfa5',
      titleLabel:'VOTRE NOM',           titlePh:'Ex: Camille L.',
      sloganLabel:'ACCROCHE',           sloganPh:'Ex: Travel · Food · Bien-être',
      urlLabel:'LIEN DESTINATION',      urlPh:'https://votrecontenu.com',
      ctaDefault:'Découvrir',           showImg:true,  showSocial:false, showMusic:false, showApp:false,
      hint:'La photo est affichée en plein bloc avec gradient.' },
    { id:'text',     label:'Publication',icon:'≡', color:'#90a4ae',
      titleLabel:"TITRE DE L'ARTICLE",  titlePh:'Ex: Comment lancer son SaaS en 30j',
      sloganLabel:'EXTRAIT / ACCROCHE', sloganPh:'Ex: Un guide complet pas-à-pas…',
      urlLabel:"LIEN DE L'ARTICLE",     urlPh:'https://medium.com/…',
      ctaDefault:"Lire l'article",      showImg:false, showSocial:false, showMusic:false, showApp:false,
      hint:`Le titre s'affiche typographié directement sur le bloc.` },
  ];
  const SOCIALS = [
    {id:'instagram',label:'Instagram',color:'#e1306c',e:'📸'},{id:'tiktok',label:'TikTok',color:'#69c9d0',e:'🎵'},
    {id:'x',label:'X/Twitter',color:'#1d9bf0',e:'✕'},{id:'youtube',label:'YouTube',color:'#ff0000',e:'▶'},
    {id:'linkedin',label:'LinkedIn',color:'#0a66c2',e:'💼'},{id:'snapchat',label:'Snapchat',color:'#fffc00',e:'👻'},
    {id:'twitch',label:'Twitch',color:'#9146ff',e:'🎮'},{id:'discord',label:'Discord',color:'#5865f2',e:'💬'},
  ];
  const MUSIC_PLATS = [
    {id:'spotify',label:'Spotify',color:'#1ed760',e:'🎵'},{id:'apple_music',label:'Apple Music',color:'#fc3c44',e:'🍎'},
    {id:'soundcloud',label:'SoundCloud',color:'#ff5500',e:'☁'},{id:'deezer',label:'Deezer',color:'#a238ff',e:'🎶'},
    {id:'youtube_music',label:'YT Music',color:'#ff0000',e:'▶'},{id:'bandcamp',label:'Bandcamp',color:'#1da0c3',e:'🎸'},
  ];

  const cat = CATS.find(c => c.id === category) || CATS[2];
  const selSocial = SOCIALS.find(s => s.id === blockForm.social_network);
  const selMusic  = MUSIC_PLATS.find(p => p.id === blockForm.music_platform);
  const blockColor = blockForm.primary_color || selSocial?.color || selMusic?.color || cat.color;

  const setF = (k,v) => setBlockForm(f => ({...f,[k]:v}));

  const inpStyle = { width:'100%', padding:'10px 13px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, color:U.text, fontSize:13, fontFamily:F.b, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' };
  const focusInp = e => e.target.style.borderColor = U.border2;
  const blurInp  = e => e.target.style.borderColor = U.border;

  const handleCheckout = async () => {
    setLoading(true); setError(null);
    try {
      const displayName = blockForm.title || email.split('@')[0];
      const { url } = await createCheckoutSession({
        slotX: slot.x, slotY: slot.y, tier: slot.tier, days, email,
        billing_type: billing.type,
        discount_pct: billing.discount,
        display_name: displayName,
        slogan: blockForm.slogan,
        cta_url: blockForm.url,
        cta_text: blockForm.cta_text || 'Visiter',
        image_url: blockForm.image_url,
        primary_color: blockColor,
        background_color: blockForm.background_color || '#0d1828',
        content_type: category,
        badge: cat.label.toUpperCase(),
      });
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Erreur lors du paiement');
      setLoading(false);
    }
  };

  if (!slot) return null;

  // ── Étape 0 : authentification ────────────────────────────────
  if (authLoading && step === 0) return (
    <Modal onClose={onClose} width={420} isMobile={isMobile}>
      <div style={{ padding:48, textAlign:'center', color:U.muted, fontSize:14 }}>Chargement…</div>
    </Modal>
  );

  if (step === 0) return (
    <Modal onClose={onClose} width={420} isMobile={isMobile}>
      <div style={{ padding:'36px 32px' }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:20, fontWeight:800, color:U.text, marginBottom:6 }}>
            {authMode === 'login' ? 'Connexion' : 'Créer un compte'}
          </div>
          <div style={{ fontSize:13, color:U.muted, lineHeight:1.5 }}>
            {authMode === 'login'
              ? 'Connectez-vous pour accéder au paiement et à votre espace annonceur.'
              : 'Créez votre compte pour réserver ce bloc et gérer votre publicité.'}
          </div>
        </div>

        {authMode === 'signup' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:6 }}>NOM AFFICHÉ</div>
            <input value={authName} onChange={e => setAuthName(e.target.value)}
              placeholder="Votre nom ou marque"
              style={{ width:'100%', padding:'10px 13px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, color:U.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
        )}

        <div style={{ marginBottom:12 }}>
          <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:6 }}>EMAIL</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="votre@email.com"
            style={{ width:'100%', padding:'10px 13px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, color:U.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:6 }}>MOT DE PASSE</div>
          <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)}
            placeholder={authMode === 'signup' ? 'Minimum 6 caractères' : '••••••••'}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{ width:'100%', padding:'10px 13px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, color:U.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>

        {authError && (
          <div style={{ padding:'8px 12px', borderRadius:6, background:`${U.err}12`, border:`1px solid ${U.err}30`, color:U.err, fontSize:12, marginBottom:14, textAlign:'center' }}>{authError}</div>
        )}

        <button onClick={handleAuth} disabled={authLoading}
          style={{ width:'100%', padding:13, borderRadius:10, cursor:authLoading?'wait':'pointer', background:U.accent, border:'none', color:U.accentFg, fontWeight:700, fontSize:14, opacity:authLoading?0.6:1 }}>
          {authLoading ? '…' : authMode === 'login' ? 'Se connecter →' : 'Créer mon compte →'}
        </button>

        <div style={{ marginTop:16, textAlign:'center', fontSize:12, color:U.muted }}>
          {authMode === 'login'
            ? <span>Pas encore de compte ? <span onClick={() => { setAuthMode('signup'); setAuthError(''); }} style={{ color:U.accent, cursor:'pointer', fontWeight:600 }}>S'inscrire</span></span>
            : <span>Déjà un compte ? <span onClick={() => { setAuthMode('login'); setAuthError(''); }} style={{ color:U.accent, cursor:'pointer', fontWeight:600 }}>Se connecter</span></span>
          }
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} width={820} isMobile={isMobile}>
      {/* ── Layout 2 colonnes: form (gauche) + preview (droite) ── */}
      <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', maxHeight:isMobile?'92vh':'88vh', overflow:'hidden' }}>

        {/* ── Preview compacte mobile (bandeau haut) ── */}
        {isMobile && (
          <div style={{ flexShrink:0, padding:'12px 16px', borderBottom:`1px solid ${U.border}`, background:U.s2 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:52, height:52, borderRadius:10, background:blockForm.background_color||'#0d1828', border:`1.5px solid ${blockColor}55`, position:'relative', overflow:'hidden', boxShadow:`0 0 14px ${blockColor}30` }}>
                  {blockForm.image_url
                    ? <img src={blockForm.image_url} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                    : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontSize:20, fontWeight:900, color:blockColor, fontFamily:F.h }}>{selSocial?.e || selMusic?.e || cat.icon}</span>
                      </div>
                  }
                </div>
                <div style={{ position:'absolute', top:-4, right:-4, width:8, height:8, borderRadius:'50%', background:'#00e8a2', border:'1.5px solid #080808', animation:'blink 1.5s infinite' }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                  <span style={{ fontSize:8, fontWeight:800, color:'#00e8a2', letterSpacing:'0.08em' }}>APERÇU</span>
                  <span style={{ padding:'1px 6px', borderRadius:3, background:`${c}15`, border:`1px solid ${c}30`, color:c, fontSize:8, fontWeight:800 }}>{TIER_LABEL[tier]}</span>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:blockColor, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {blockForm.title || <span style={{color:'rgba(255,255,255,0.25)'}}>Votre titre…</span>}
                </div>
                {blockForm.slogan && <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{blockForm.slogan}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Colonne GAUCHE : Formulaire ── */}
        <div style={{ flex:1, padding: isMobile ? '16px 16px 28px' : '28px 28px 32px', overflowY:'auto', minWidth:0 }}>

        {/* Header */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, background:`${c}18`, border:`1px solid ${c}30`, color:c, fontSize:10, fontWeight:700, letterSpacing:'0.05em', marginBottom:8 }}>{TIER_LABEL[tier]}</div>
          <h2 style={{ color:U.text, fontWeight:700, fontSize:18, fontFamily:F.h, margin:'0 0 4px' }}>Réserver ce bloc</h2>
          <div style={{ color:U.muted, fontSize:12 }}>Position ({slot.x}, {slot.y}) · €{pricePerDay}/jour</div>
        </div>

        {/* Durée */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em' }}>DURÉE</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ padding:'2px 8px', borderRadius:4, background:`${billing.color}18`, border:`1px solid ${billing.color}40`, color:billing.color, fontSize:10, fontWeight:700 }}>{billing.icon} {billing.label}</span>
              <span style={{ color:U.muted, fontSize:10 }}>{billing.desc}</span>
            </div>
          </div>

          {/* Slider */}
          <div style={{ position:'relative', padding:'4px 0 2px' }}>
            <style>{`
              .dur-slider { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:2px; outline:none; cursor:pointer; background: linear-gradient(90deg, ${billing.color} ${((days-1)/89)*100}%, rgba(0,200,240,0.10) ${((days-1)/89)*100}%); }
              .dur-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:${billing.color}; box-shadow:0 0 8px ${billing.color}88; cursor:pointer; }
              .dur-slider::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:${billing.color}; box-shadow:0 0 8px ${billing.color}88; cursor:pointer; border:none; }
            `}</style>
            <input type="range" min={1} max={90} value={days} className="dur-slider"
              onChange={e => setDays(Number(e.target.value))}
              style={{ width:'100%' }} />
          </div>

          {/* Snap buttons */}
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            {[1,7,30,90].map(d => {
              const b = getBilling(d);
              const active = days === d;
              return (
                <button key={d} onClick={() => setDays(d)} style={{ flex:1, padding:'7px 4px', borderRadius:7, cursor:'pointer', fontFamily:F.b, background:active?`${b.color}15`:U.faint, border:`1px solid ${active?b.color+'55':U.border}`, color:active?b.color:U.muted, fontWeight:active?700:400, fontSize:11, transition:'all 0.15s', lineHeight:1.4 }}>
                  {d}J<div style={{ fontSize:9, opacity:0.7, marginTop:1 }}>{b.label}</div>
                </button>
              );
            })}
          </div>

          {/* Counter + savings */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
            <span style={{ color:U.text, fontSize:13, fontWeight:600 }}>{days} jour{days>1?'s':''}</span>
            {savings > 0 && <span style={{ color:billing.color, fontSize:11, fontWeight:700 }}>−€{savings} économisés</span>}
          </div>
        </div>

        <div style={{ height:1, background:U.border, marginBottom:20 }} />

        {/* ─── CATÉGORIE ─── */}
        <div style={{ marginBottom:16 }}>
          <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:10 }}>CATÉGORIE DU BLOC</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {CATS.map(cat => (
              <button key={cat.id} onClick={() => { setCategory(cat.id); setF('primary_color', cat.color); setF('cta_text', cat.ctaDefault || 'Visiter'); }}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${category===cat.id?cat.color:U.border}`, background:category===cat.id?cat.color+'15':'transparent', color:category===cat.id?cat.color:U.muted, fontSize:11, fontWeight:category===cat.id?700:400, cursor:'pointer', display:'flex', alignItems:'center', gap:4, transition:'all 0.15s' }}>
                <span>{cat.icon}</span><span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── CHAMPS ADAPTATIFS ─── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>

          {/* Hint catégorie */}
          {cat.hint && (
            <div style={{ padding:'8px 12px', borderRadius:7, background:`${cat.color}10`, border:`1px solid ${cat.color}25`, fontSize:11, color:cat.color, display:'flex', alignItems:'center', gap:6 }}>
              <span>{cat.icon}</span> {cat.hint}
            </div>
          )}

          <div>
            <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:7 }}>{cat.titleLabel || 'NOM / TITRE'}</div>
            <input type="text" value={blockForm.title} maxLength={40}
              onChange={e => setF('title', e.target.value)}
              onFocus={focusInp} onBlur={blurInp}
              placeholder={cat.titlePh || 'Votre nom ou marque'}
              style={inpStyle} />
          </div>

          <div>
            <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:7 }}>{cat.sloganLabel || 'ACCROCHE'}</div>
            <input type="text" value={blockForm.slogan} maxLength={80}
              onChange={e => setF('slogan', e.target.value)}
              onFocus={focusInp} onBlur={blurInp}
              placeholder={cat.sloganPh || 'Une phrase courte et percutante…'}
              style={inpStyle} />
          </div>

          {/* Réseau social picker */}
          {cat.showSocial && (
            <div>
              <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:7 }}>RÉSEAU</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {SOCIALS.map(s => (
                  <button key={s.id} onClick={() => { setF('social_network',s.id); setF('primary_color',s.color); }}
                    style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${blockForm.social_network===s.id?s.color:U.border}`, background:blockForm.social_network===s.id?s.color+'18':'transparent', color:blockForm.social_network===s.id?s.color:U.muted, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                    {s.e} {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Musique picker */}
          {cat.showMusic && (
            <div>
              <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:7 }}>PLATEFORME</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {MUSIC_PLATS.map(p => (
                  <button key={p.id} onClick={() => { setF('music_platform',p.id); setF('primary_color',p.color); }}
                    style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${blockForm.music_platform===p.id?p.color:U.border}`, background:blockForm.music_platform===p.id?p.color+'18':'transparent', color:blockForm.music_platform===p.id?p.color:U.muted, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                    {p.e} {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Image URL */}
          {cat.showImg && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em' }}>IMAGE</div>
                <div style={{ display:'flex', gap:2, background:U.faint, borderRadius:6, padding:2 }}>
                  {['url','upload'].map(m => (
                    <button key={m} onClick={() => setImgMode(m)} style={{ padding:'3px 10px', borderRadius:4, border:'none', cursor:'pointer', fontSize:10, fontWeight:700, background: imgMode===m ? U.accent : 'transparent', color: imgMode===m ? U.accentFg : U.muted, transition:'all 0.15s' }}>
                      {m === 'url' ? 'URL' : '⬆ Upload'}
                    </button>
                  ))}
                </div>
              </div>
              {imgMode === 'url' ? (
                <input type="url" value={blockForm.image_url}
                  onChange={e => setF('image_url', e.target.value)}
                  onFocus={focusInp} onBlur={blurInp}
                  placeholder="https://exemple.com/image.jpg"
                  style={inpStyle} />
              ) : (
                <div>
                  <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'16px', borderRadius:8, background:U.faint, border:`2px dashed ${U.border2}`, cursor:'pointer', transition:'border-color 0.15s' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={async e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (!file || !file.type.startsWith('image/')) return;
                      setImgUploading(true);
                      try {
                        const { uploadBlockImage } = await import('../lib/supabase-auth');
                        const url = await uploadBlockImage(file);
                        if (url) setF('image_url', url);
                      } catch(err) { console.error(err); }
                      finally { setImgUploading(false); }
                    }}>
                    <input type="file" accept="image/*" style={{ display:'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImgUploading(true);
                        try {
                          const { uploadBlockImage } = await import('../lib/supabase-auth');
                          const url = await uploadBlockImage(file);
                          if (url) setF('image_url', url);
                        } catch(err) { console.error(err); }
                        finally { setImgUploading(false); }
                      }} />
                    {imgUploading ? (
                      <span style={{ color:U.muted, fontSize:12 }}>Upload en cours…</span>
                    ) : blockForm.image_url ? (
                      <>
                        <img src={blockForm.image_url} alt="" style={{ width:60, height:60, objectFit:'cover', borderRadius:8 }} />
                        <span style={{ color:U.accent, fontSize:11, fontWeight:600 }}>Changer l'image</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:20 }}>🖼</span>
                        <span style={{ color:U.muted, fontSize:12, textAlign:'center' }}>Glissez une image ici<br/>ou cliquez pour choisir</span>
                        <span style={{ color:U.muted, fontSize:10 }}>JPG, PNG, WebP — max 5 Mo</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>
          )}

          {/* URL principale */}
          <div>
            <div style={{ color:U.muted, fontSize:10, fontWeight:600, letterSpacing:'0.07em', marginBottom:7 }}>{cat.urlLabel}</div>
            <input type="url" value={blockForm.url}
              onChange={e => setF('url', e.target.value)}
              onFocus={focusInp} onBlur={blurInp}
              placeholder={cat.urlPh}
              style={inpStyle} />
          </div>

          {/* Aperçu */}
          <div style={{ borderRadius:8, background:blockForm.background_color||'#0d1828', border:`1px solid ${blockColor}30`, padding:12, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:7, flexShrink:0, background:blockForm.image_url?`url(${blockForm.image_url}) center/cover`:`${blockColor}18`, border:`2px solid ${blockColor}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:blockColor, overflow:'hidden' }}>
              {!blockForm.image_url && (selSocial?.e || selMusic?.e || cat.icon)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:blockColor }}>{blockForm.title||'Votre titre'}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{blockForm.slogan||'Votre accroche…'}</div>
            </div>
            <div style={{ fontSize:9, fontWeight:700, color:blockColor, padding:'2px 7px', background:`${blockColor}15`, borderRadius:4, border:`1px solid ${blockColor}30`, flexShrink:0 }}>{cat.label.toUpperCase()}</div>
          </div>
        </div>

        <div style={{ height:1, background:U.border, marginBottom:20 }} />

        {/* Email connecté (lecture seule) */}
        <div style={{ marginBottom:14, padding:'9px 13px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:U.muted }}>Connecté en tant que</span>
          <span style={{ fontSize:13, color:U.text, fontWeight:600 }}>{email}</span>
        </div>

        {/* Récap prix */}
        <div style={{ padding:'11px 14px', borderRadius:8, background:U.faint, border:`1px solid ${U.border}`, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: billing.discount > 0 ? 6 : 0 }}>
            <span style={{ color:U.muted, fontSize:13 }}>{days} jours × €{pricePerDay}</span>
            {billing.discount > 0
              ? <span style={{ color:U.muted, fontSize:13, textDecoration:'line-through' }}>€{rawPrice}</span>
              : <span style={{ color:U.text, fontWeight:700, fontSize:18, fontFamily:F.h }}>€{totalPrice}</span>
            }
          </div>
          {billing.discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color:billing.color, fontSize:12, fontWeight:600 }}>{billing.icon} {billing.label} · {Math.round(billing.discount*100)}% de remise</span>
              <span style={{ color:U.text, fontWeight:700, fontSize:18, fontFamily:F.h }}>€{totalPrice}</span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding:'8px 12px', borderRadius:6, background:`${U.err}12`, border:`1px solid ${U.err}30`, color:U.err, fontSize:12, marginBottom:12, textAlign:'center' }}>{error}</div>
        )}

        <button onClick={handleCheckout} disabled={loading} style={{ width:'100%', padding:'13px', borderRadius:10, fontFamily:F.b, cursor:loading?'wait':'pointer', background:loading?U.s2:U.accent, border:'none', color:loading?U.muted:U.accentFg, fontWeight:700, fontSize:14, opacity:loading?0.6:1, transition:'opacity 0.15s, box-shadow 0.2s', boxShadow:loading?'none':`0 0 22px ${U.accent}50` }}>
          {loading ? 'Redirection vers Stripe…' : `Payer €${totalPrice}`}
        </button>
        <div style={{ marginTop:10, color:U.muted, fontSize:11, textAlign:'center' }}>{t('checkout.secure')}</div>
        </div>{/* fin col gauche */}

        {/* ── Colonne DROITE : Preview live (desktop seulement) ── */}
        {!isMobile && (
          <div style={{
            width:280, flexShrink:0,
            borderLeft:`1px solid ${U.border}`,
            background:U.s2,
            padding:'28px 20px',
            overflowY:'auto',
            display:'flex', flexDirection:'column', gap:0,
          }}>
            <BlockPreview
              tier={tier}
              blockForm={blockForm}
              category={category}
              CATS={CATS}
              SOCIALS={SOCIALS}
              MUSIC_PLATS={MUSIC_PLATS}
            />
          </div>
        )}

      </div>{/* fin layout 2col */}
    </Modal>
  );
}


// ─── Block rendering ───────────────────────────────────────────

const SOCIAL_ICONS_MAP  = { instagram:'📸', tiktok:'🎵', x:'✕', youtube:'▶', linkedin:'💼', snapchat:'👻', twitch:'🎮', discord:'💬', facebook:'👍', pinterest:'📌' };
const SOCIAL_COLORS_MAP = { instagram:'#e1306c', tiktok:'#69c9d0', x:'#1d9bf0', youtube:'#ff0000', linkedin:'#0a66c2', snapchat:'#fffc00', twitch:'#9146ff', discord:'#5865f2', facebook:'#0082fb', pinterest:'#e60023' };
const MUSIC_ICONS_MAP   = { spotify:'🎵', apple_music:'🍎', soundcloud:'☁', deezer:'🎶', youtube_music:'▶', bandcamp:'🎸' };
const MUSIC_COLORS_MAP  = { spotify:'#1ed760', apple_music:'#fc3c44', soundcloud:'#ff5500', deezer:'#a238ff', youtube_music:'#ff0000', bandcamp:'#1da0c3' };
const APP_STORE_LABELS  = { app_store:'🍎 App Store', google_play:'▶ Google Play', web:'🌐 Web' };
const APP_STORE_COLORS  = { app_store:'#007aff', google_play:'#01875f', web:'#6366f1' };

function BlockMedia({ tenant, tier }) {
  const sz = TIER_SIZE[tier] || 56;
  if (!tenant) return null;
  const { t, img, c, b, l, name, slogan, social, music, appStore } = tenant;

  // ── VIDÉO : thumbnail en fond + overlay sombre + bouton ▶ circulaire glow
  if (t === 'video') {
    const btnSz = Math.min(sz * 0.42, 32);
    return (
      <div style={{ position:'absolute', inset:0, overflow:'hidden', background:b||'#0a0a0a' }}>
        {img && <img src={img} alt={name||''} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.55 }} onError={e=>e.target.style.display='none'} />}
        {/* overlay sombre dégradé */}
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)` }} />
        {sz >= 16 && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3 }}>
            {/* bouton ▶ circulaire avec glow */}
            <div style={{
              width:btnSz, height:btnSz, borderRadius:'50%',
              background:'rgba(0,0,0,0.6)',
              border:`${Math.max(1,btnSz*0.06)}px solid ${c}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              backdropFilter:'blur(6px)',
              boxShadow:`0 0 ${btnSz*0.6}px ${c}70, 0 0 ${btnSz*1.2}px ${c}30`,
            }}>
              <span style={{ color:c, fontSize:Math.max(8, btnSz*0.38), lineHeight:1, paddingLeft:'12%' }}>▶</span>
            </div>
            {sz >= 52 && <span style={{ color:'rgba(255,255,255,0.85)', fontSize:Math.min(sz*0.1,9), fontWeight:700, textAlign:'center', maxWidth:'85%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── IMAGE / LIFESTYLE / MARQUE / VÊTEMENTS : image full bleed ─
  if (img && (t === 'image' || t === 'lifestyle' || t === 'brand' || t === 'clothing')) {
    return (
      <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
        <img src={img} alt={name||''} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'} />
        {/* Gradient bas pour lifestyle */}
        {t === 'lifestyle' && (
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }}>
            {sz >= 52 && <div style={{ position:'absolute', bottom:4, left:4, right:4, color:'#fff', fontSize:Math.min(sz*0.1,9), fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>}
          </div>
        )}
        {/* Overlay dégradé marque */}
        {t === 'brand' && (
          <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${b||'rgba(0,0,0,0.65)'} 0%, transparent 55%)` }} />
        )}
        {/* Badge prix pour vêtements */}
        {t === 'clothing' && slogan && sz >= 26 && (
          <div style={{
            position:'absolute', bottom:3, right:3,
            padding:`${Math.max(1,sz*0.04)}px ${Math.max(3,sz*0.08)}px`,
            borderRadius:Math.max(2,sz*0.04),
            background:'rgba(0,0,0,0.82)',
            color:'#fff', fontSize:Math.min(sz*0.11,10), fontWeight:800,
            backdropFilter:'blur(6px)',
            border:'1px solid rgba(255,255,255,0.18)',
            lineHeight:1.2,
          }}>{slogan.slice(0,14)}</div>
        )}
      </div>
    );
  }

  // ── RÉSEAUX SOCIAUX : fond radial couleur plateforme + grande icône ─
  if (t === 'social') {
    const icon = SOCIAL_ICONS_MAP[social] || '⊕';
    const col  = SOCIAL_COLORS_MAP[social] || c;
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, padding:2, overflow:'hidden',
        background:`radial-gradient(circle at 50% 45%, ${col}28 0%, ${col}0a 55%, ${b||'#0a0a14'} 100%)` }}>
        {sz >= 11 && <span style={{ fontSize:Math.min(sz*0.52,36), lineHeight:1, position:'relative', filter:`drop-shadow(0 0 ${Math.min(sz*0.15,8)}px ${col}90)` }}>{icon}</span>}
        {sz >= 44 && <span style={{ color:col, fontSize:Math.min(sz*0.1,9), fontWeight:700, textAlign:'center', maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', position:'relative', marginTop:1 }}>{name}</span>}
      </div>
    );
  }

  // ── MUSIQUE : icône plateforme colorée + barres égaliseur animées ─
  if (t === 'music') {
    const icon = MUSIC_ICONS_MAP[music] || '🎵';
    const col  = MUSIC_COLORS_MAP[music] || c;
    const bars = [0.55, 1, 0.7, 0.9, 0.45, 0.8];
    const barH = Math.min(sz * 0.2, 16);
    const barW = Math.max(1.5, sz * 0.038);
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:Math.max(1,sz*0.04), padding:2, overflow:'hidden',
        background:`radial-gradient(ellipse at 50% 35%, ${col}22 0%, ${col}05 60%, ${b||'#0a0a14'} 100%)` }}>
        {sz >= 11 && <span style={{ color:col, fontSize:Math.min(sz*0.46,30), lineHeight:1, fontWeight:900, position:'relative', filter:`drop-shadow(0 0 ${Math.min(sz*0.12,6)}px ${col}80)` }}>{icon}</span>}
        {sz >= 28 && (
          <div style={{ display:'flex', alignItems:'flex-end', gap:Math.max(1, barW*0.4), height:barH, position:'relative' }}>
            {bars.map((h,i) => (
              <div key={i} style={{ width:barW, borderRadius:barW, background:col,
                height: barH * h,
                animation: `eqBar${i % 5} ${0.38 + i*0.11}s ease-in-out infinite alternate`,
                boxShadow:`0 0 ${barW*1.5}px ${col}70`,
              }} />
            ))}
          </div>
        )}
        {sz >= 52 && <span style={{ color:col+'cc', fontSize:Math.min(sz*0.09,8), fontWeight:700, textAlign:'center', maxWidth:'92%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', position:'relative' }}>{name}</span>}
      </div>
    );
  }

  // ── APP : app icon arrondie style App Store + badge store en bas ─
  if (t === 'app') {
    const storeCol = APP_STORE_COLORS[appStore] || c;
    const storeLbl = appStore === 'app_store' ? '🍎' : appStore === 'google_play' ? '▶' : '🌐';
    const iconSz = Math.min(sz * 0.54, 40);
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:Math.max(1,sz*0.04), padding:3, background:b||`${storeCol}0a`, overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 40%, ${storeCol}18 0%, transparent 65%)` }} />
        {img
          ? <img src={img} alt="" style={{ width:iconSz, height:iconSz, borderRadius:iconSz*0.22, objectFit:'cover',
              border:`1.5px solid ${storeCol}40`,
              boxShadow:`0 ${iconSz*0.08}px ${iconSz*0.3}px rgba(0,0,0,0.5), 0 0 ${iconSz*0.2}px ${storeCol}30`,
              position:'relative'
            }} onError={e=>e.target.style.display='none'} />
          : sz >= 20 && <div style={{ width:iconSz, height:iconSz, borderRadius:iconSz*0.22, background:`${storeCol}22`,
              border:`1.5px solid ${storeCol}55`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:iconSz*0.42, fontWeight:900, color:storeCol, fontFamily:F.h,
              boxShadow:`0 ${iconSz*0.08}px ${iconSz*0.3}px rgba(0,0,0,0.4)`,
              position:'relative'
            }}>{l}</div>
        }
        {sz >= 26 && (
          <div style={{ position:'relative', display:'flex', alignItems:'center', gap:2, padding:`${Math.max(1,sz*0.03)}px ${Math.max(2,sz*0.06)}px`, borderRadius:Math.max(2,sz*0.04), background:`${storeCol}20`, border:`1px solid ${storeCol}40` }}>
            <span style={{ fontSize:Math.min(sz*0.12,9), lineHeight:1 }}>{storeLbl}</span>
            {sz >= 44 && <span style={{ color:storeCol, fontSize:Math.min(sz*0.09,8), fontWeight:700, lineHeight:1 }}>{appStore === 'app_store' ? 'App Store' : appStore === 'google_play' ? 'Google Play' : 'Web'}</span>}
          </div>
        )}
        {sz >= 56 && <span style={{ color:storeCol+'bb', fontSize:Math.min(sz*0.09,8), fontWeight:700, textAlign:'center', maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', position:'relative' }}>{name}</span>}
      </div>
    );
  }

  // ── PUBLICATION : titre typographié + lignes de séparation ───
  if (t === 'text') {
    const pad = Math.max(3, sz * 0.08);
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'center', padding:pad, background:b||'transparent', overflow:'hidden' }}>
        {sz >= 20 && <div style={{ width:'45%', height:Math.max(1, sz*0.025), background:`linear-gradient(90deg, ${c}80, ${c}20)`, marginBottom:Math.max(2,sz*0.05), borderRadius:1 }} />}
        {sz >= 24 && <div style={{ color:c, fontSize:Math.min(sz*0.14,11), fontWeight:800, lineHeight:1.25, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:sz >= 56 ? 3 : 2, WebkitBoxOrient:'vertical', letterSpacing:'-0.01em' }}>{name}</div>}
        {sz >= 64 && slogan && <div style={{ color:`${c}60`, fontSize:Math.min(sz*0.09,8), marginTop:sz*0.04, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>{slogan}</div>}
        {sz >= 30 && <div style={{ width:'28%', height:Math.max(1, sz*0.02), background:`linear-gradient(90deg, ${c}40, transparent)`, marginTop:Math.max(2,sz*0.05), borderRadius:1 }} />}
      </div>
    );
  }

  // ── IMAGE générique ───────────────────────────────────────────
  if (img) return (
    <img src={img} alt={name||''} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'} />
  );

  // ── DÉFAUT : initiales + nom ──────────────────────────────────
  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, padding:3, background:b||'transparent', overflow:'hidden' }}>
      {sz >= 30 && <span style={{ color:c, fontSize:Math.min(sz*0.36,32), fontWeight:900, lineHeight:1, fontFamily:F.h }}>{l}</span>}
      {sz >= 52 && <span style={{ color:c+'cc', fontSize:Math.min(sz*0.12,11), fontWeight:700, textAlign:'center', lineHeight:1.2, maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>}
    </div>
  );
}

// ─── LiveMiniBadge — badge permanent sur gros blocs occupés ──────
function LiveMiniBadge({ slot, sz }) {
  const [stats, setStats] = useState(statsCache[slot.id] || null);

  useEffect(() => {
    if (!slot.occ || !slot.tenant?.bookingId) return;
    if (statsCache[slot.id]) { setStats(statsCache[slot.id]); return; }
    fetchSlotStats(slot.x, slot.y).then(({ data }) => {
      if (data) { statsCache[slot.id] = data; setStats(data); }
    }).catch(() => {});
  }, [slot.id]);

  if (!stats || stats.impressions_7d === 0) return null;
  const c = slot.tenant?.c || TIER_COLOR[slot.tier];
  const v = stats.impressions_7d >= 1000
    ? `${(stats.impressions_7d / 1000).toFixed(1)}k`
    : stats.impressions_7d?.toString() ?? '0';

  return (
    <div style={{
      position: 'absolute', bottom: 3, right: 3,
      display: 'flex', alignItems: 'center', gap: 3,
      padding: sz >= 80 ? '2px 5px' : '1px 4px',
      borderRadius: 4, zIndex: 8, pointerEvents: 'none',
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
      border: `1px solid ${c}30`,
    }}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00e8a2', flexShrink: 0 }} />
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: sz >= 80 ? 8 : 7, fontWeight: 700, lineHeight: 1 }}>
        {v}
      </span>
    </div>
  );
}

// ─── HoverStatsTooltip — badge stats au survol des blocs occupés ─
const statsCache = {}; // cache module-level pour éviter les re-fetch

function HoverStatsBadge({ slot, sz }) {
  const [stats, setStats] = useState(statsCache[slot.id] || null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!slot.occ || !slot.tenant?.bookingId) return;
    if (statsCache[slot.id]) { setStats(statsCache[slot.id]); return; }
    // Fetch une seule fois au premier hover
    if (!visible) return;
    fetchSlotStats(slot.x, slot.y).then(({ data }) => {
      if (data) { statsCache[slot.id] = data; setStats(data); }
    }).catch(() => {});
  }, [visible, slot.id]);

  if (!slot.occ || sz < 24) return null;
  const c = slot.tenant?.c || TIER_COLOR[slot.tier];
  const hasData = stats && (stats.impressions_7d > 0 || stats.clicks_7d > 0);

  return (
    <div
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{ position:'absolute', inset:0, zIndex:10 }}
    >
      {visible && hasData && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
          background: U.s1, border:`1px solid ${c}40`, borderRadius:8, padding:'7px 10px',
          whiteSpace:'nowrap', pointerEvents:'none', zIndex:200,
          boxShadow:`0 4px 20px rgba(0,0,0,0.7), 0 0 0 1px ${c}20`,
          minWidth: 110,
        }}>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:c, fontWeight:800, fontSize:13, fontFamily:F.h, lineHeight:1 }}>
                {stats.impressions_7d?.toLocaleString('fr-FR') ?? '0'}
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:8, marginTop:2 }}>vues / 7j</div>
            </div>
            <div style={{ width:1, background:'rgba(255,255,255,0.08)' }} />
            <div style={{ textAlign:'center' }}>
              <div style={{ color:c, fontWeight:800, fontSize:13, fontFamily:F.h, lineHeight:1 }}>
                {stats.clicks_7d?.toLocaleString('fr-FR') ?? '0'}
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:8, marginTop:2 }}>clics / 7j</div>
            </div>
            {stats.ctr_pct > 0 && (
              <>
                <div style={{ width:1, background:'rgba(255,255,255,0.08)' }} />
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#00e8a2', fontWeight:800, fontSize:13, fontFamily:F.h, lineHeight:1 }}>
                    {stats.ctr_pct}%
                  </div>
                  <div style={{ color:'rgba(255,255,255,0.4)', fontSize:8, marginTop:2 }}>CTR</div>
                </div>
              </>
            )}
          </div>
          {/* Flèche en bas */}
          <div style={{ position:'absolute', bottom:-5, left:'50%', transform:'translateX(-50%) rotate(45deg)',
            width:8, height:8, background:U.s1, border:`1px solid ${c}30`,
            borderTop:'none', borderLeft:'none' }} />
        </div>
      )}
    </div>
  );
}


function BuyoutModal({ slot, onClose }) {
  const { isMobile } = useScreenSize();
  const t = useT();
  const [step, setStep] = useState(1); // 1=form 2=sent
  const [offerEuros, setOfferEuros] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const minOffer = slot ? Math.ceil(priceEur(slot.tier) * 1.5) : 0;
  const c = slot ? TIER_COLOR[slot.tier] : U.accent;

  const handleSubmit = async () => {
    if (!email || !email.includes('@')) { setError('Email invalide'); return; }
    const cents = Math.round(parseFloat(offerEuros) * 100);
    if (!cents || cents < minOffer * 100) { setError(`Offre minimum : €${minOffer}`); return; }
    setLoading(true); setError(null);
    try {
      await submitBuyoutOffer({
        slotX: slot.x, slotY: slot.y,
        bookingId: slot.bookingId,
        offerCents: cents,
        buyerEmail: email,
        buyerName: name,
        message,
      });
      setStep(2);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  if (!slot) return null;

  return (
    <Modal onClose={onClose} width={440} isMobile={isMobile}>
      <div style={{ padding: isMobile ? '24px 20px 32px' : '36px 36px 40px' }}>
        {step === 1 ? (<>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: `${c}15`, border: `1px solid ${c}30`, color: c, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 10 }}>{TIER_LABEL[slot.tier]}</div>
            <h2 style={{ color: U.text, fontWeight: 700, fontSize: 20, fontFamily: F.h, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{t('buyout.title')}</h2>
            <p style={{ color: U.muted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
{t('buyout.body')} <strong style={{ color: U.text }}>{t('buyout.72h')}</strong> {t('buyout.body2')}
            </p>
          </div>

          {/* Offer amount */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 8 }}>{t('buyout.amount')}</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: U.muted, fontSize: 14 }}>€</span>
              <input
                type="number" min={minOffer} step="1"
                value={offerEuros} onChange={e => setOfferEuros(e.target.value)}
                placeholder={`Min. ${minOffer}`}
                style={{ width: '100%', padding: '11px 14px 11px 28px', borderRadius: 8, background: U.faint, border: `1px solid ${U.border}`, color: U.text, fontSize: 16, fontFamily: F.h, fontWeight: 700, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = c}
                onBlur={e => e.target.style.borderColor = U.border}
              />
            </div>
            <div style={{ color: U.muted, fontSize: 11, marginTop: 6 }}>
              Offre minimum : <span style={{ color: U.text }}>€{minOffer}</span> · Commission plateforme : 20%
            </div>
          </div>

          {/* Contact */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 6 }}>EMAIL</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('buyout.email.ph')}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: U.faint, border: `1px solid ${U.border}`, color: U.text, fontSize: 13, fontFamily: F.b, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = U.border2} onBlur={e => e.target.style.borderColor = U.border} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 6 }}>NOM (optionnel)</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('buyout.name.ph')}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: U.faint, border: `1px solid ${U.border}`, color: U.text, fontSize: 13, fontFamily: F.b, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = U.border2} onBlur={e => e.target.style.borderColor = U.border} />
            </div>
          </div>

          {/* Message */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: U.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', marginBottom: 6 }}>MESSAGE POUR L'OCCUPANT (optionnel)</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder={t('buyout.message.ph')}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: U.faint, border: `1px solid ${U.border}`, color: U.text, fontSize: 13, fontFamily: F.b, outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = U.border2} onBlur={e => e.target.style.borderColor = U.border} />
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: `${U.err}12`, border: `1px solid ${U.err}30`, color: U.err, fontSize: 12, marginBottom: 14 }}>{error}</div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 10, fontFamily: F.b, cursor: loading ? 'wait' : 'pointer', background: U.accent, border: 'none', color: U.accentFg, fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1, boxShadow: `0 0 22px ${U.accent}45` }}>
            {loading ? 'Envoi…' : 'Envoyer l\'offre →'}
          </button>
          <p style={{ color: U.muted, fontSize: 11, textAlign: 'center', marginTop: 10, marginBottom: 0 }}>{t('buyout.nodebite')}</p>
        </>) : (
          /* Step 2 — Confirmation */
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${U.accent}15`, border: `1px solid ${U.accent}30`, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <polyline points="4,11 9,16 18,6" stroke={U.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ color: U.text, fontWeight: 700, fontSize: 20, fontFamily: F.h, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{t('buyout.sent.title')}</h2>
            <p style={{ color: U.muted, fontSize: 13, lineHeight: 1.7, margin: '0 0 24px' }}>
{t('buyout.sent.body')} <strong style={{ color: U.text }}>{t('buyout.72h')}</strong>.<br/>{t('buyout.sent.body2')}
            </p>
            <button onClick={onClose} style={{ padding: '12px 28px', borderRadius: 10, fontFamily: F.b, cursor: 'pointer', background: U.s2, border: `1px solid ${U.border2}`, color: U.text, fontWeight: 600, fontSize: 13 }}>{t('buyout.close')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Focus Modal ───────────────────────────────────────────────

// ─── AdvertiserProfileModal ────────────────────────────────────
// Profil complet d'un annonceur : tous ses blocs, stats, réseaux,
// description, et système de like.
function AdvertiserProfileModal({ advertiserId, slots, onClose, onOpenSlot }) {
  const { isMobile } = useScreenSize();
  const [entered, setEntered]   = useState(false);
  const [liked,   setLiked]     = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeAnim,  setLikeAnim]  = useState(false);
  const [totalStats, setTotalStats] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  const advertiserSlots = useMemo(() =>
    slots.filter(s => s.occ && s.tenant?.advertiserId === advertiserId),
    [slots, advertiserId]
  );

  const mainSlot = advertiserSlots[0];
  const tenant   = mainSlot?.tenant;
  if (!tenant) { onClose(); return null; }

  const c = tenant?.c || U.accent;

  // Animation entrée
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Like — localStorage
  useEffect(() => {
    setLiked(localStorage.getItem(`like_adv_${advertiserId}`) === '1');
    setLikeCount(parseInt(localStorage.getItem(`likes_count_${advertiserId}`) || '0', 10));
  }, [advertiserId]);

  const handleLike = e => {
    e.stopPropagation();
    const nl = !liked;
    const nc = Math.max(0, likeCount + (nl ? 1 : -1));
    localStorage.setItem(`like_adv_${advertiserId}`, nl ? '1' : '0');
    localStorage.setItem(`likes_count_${advertiserId}`, String(nc));
    setLiked(nl); setLikeCount(nc);
    if (nl) { setLikeAnim(true); setTimeout(() => setLikeAnim(false), 700); }
  };

  // Stats agrégées
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const ids = advertiserSlots.map(s => s.tenant?.bookingId).filter(Boolean);
    if (!ids.length) return;
    fetch(`/api/slots?type=stats&ids=${ids.join(',')}`)
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows)) return;
        const agg = rows.reduce((acc, r) => ({
          clicks: acc.clicks + (r.clicks || 0),
          impressions: acc.impressions + (r.impressions || 0),
          clicks_7d: acc.clicks_7d + (r.clicks_7d || 0),
          impressions_7d: acc.impressions_7d + (r.impressions_7d || 0),
        }), { clicks: 0, impressions: 0, clicks_7d: 0, impressions_7d: 0 });
        setTotalStats({ ...agg, ctr_pct: agg.impressions > 0 ? Math.round(agg.clicks / agg.impressions * 1000) / 10 : 0 });
      }).catch(() => {});
  }, [advertiserId]);

  // Métadonnées réseaux
  const SOCIAL_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#e1306c', prefix: 'https://instagram.com/' },
    tiktok:    { label: 'TikTok',    icon: '🎵', color: '#00f2ea', prefix: 'https://tiktok.com/@' },
    youtube:   { label: 'YouTube',   icon: '▶',  color: '#ff0000', prefix: 'https://youtube.com/@' },
    twitter:   { label: 'Twitter / X', icon: '𝕏', color: '#e7e9ea', prefix: 'https://x.com/' },
    linkedin:  { label: 'LinkedIn',  icon: 'in', color: '#0077b5', prefix: 'https://linkedin.com/in/' },
    facebook:  { label: 'Facebook',  icon: 'f',  color: '#1877f2', prefix: 'https://facebook.com/' },
    snapchat:  { label: 'Snapchat',  icon: '👻', color: '#fffc00', prefix: 'https://snapchat.com/add/' },
    meta:      { label: 'Threads',   icon: '@',  color: '#fff',    prefix: 'https://threads.net/@' },
  };
  const MUSIC_META = {
    spotify:     { label: 'Spotify',     icon: '♫', color: '#1ed760', prefix: 'https://open.spotify.com/artist/' },
    apple_music: { label: 'Apple Music', icon: '♪', color: '#fc3c44', prefix: 'https://music.apple.com/' },
    soundcloud:  { label: 'SoundCloud',  icon: '☁', color: '#ff5500', prefix: 'https://soundcloud.com/' },
    deezer:      { label: 'Deezer',      icon: '♬', color: '#00c7f2', prefix: 'https://deezer.com/artist/' },
  };
  const socialMeta = SOCIAL_META[tenant?.social];
  const musicMeta  = MUSIC_META[tenant?.music];

  const BADGE_LABELS = { 'CRÉATEUR': 'Créateur·ice', 'FREELANCE': 'Auto-entrepreneur', 'MARQUE': 'Marque' };
  const profileLabel = BADGE_LABELS[tenant?.badge] || tenant?.badge || '';

  // Couleur de texte sur fond coloré (lisibilité)
  const isDark = (hex) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return (0.299*r + 0.587*g + 0.114*b) < 128;
  };
  const ctaBg = c;
  const ctaFg = isDark(c.slice(0,7)) ? '#fff' : '#000';

  const px = isMobile ? 20 : 28;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.3s ease',
        // Fond : flou + teinte couleur de l'auteur
        background: `rgba(4,4,6,0.92)`,
        backdropFilter: 'blur(24px) saturate(1.4)',
      }}
    >
      {/* Halo ambiant derrière la carte */}
      <div style={{
        position: 'fixed',
        width: 700, height: 700,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${c}14 0%, transparent 65%)`,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      {/* Carte principale */}
      <div
        onClick={e => e.stopPropagation()}
        onScroll={e => setScrolled(e.currentTarget.scrollTop > 10)}
        style={{
          position: 'relative', zIndex: 1,
          width: isMobile ? '100vw' : 'min(96vw, 440px)',
          background: '#0a0a0d',
          border: `1px solid ${c}22`,
          borderRadius: isMobile ? '26px 26px 0 0' : 22,
          overflow: 'hidden',
          maxHeight: isMobile ? '93vh' : '92vh',
          overflowY: 'auto',
          transform: entered
            ? 'translateY(0) scale(1)'
            : isMobile ? 'translateY(48px)' : 'translateY(20px) scale(0.96)',
          transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: `
            0 0 0 1px ${c}18,
            0 40px 90px rgba(0,0,0,0.85),
            0 0 120px ${c}10
          `,
        }}
      >
        {/* ═══ PORTRAIT — zone haute, centrée sur l'auteur ═══ */}
        <div style={{
          position: 'relative',
          height: isMobile ? 340 : 380,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Fond : photo ou dégradé couleur */}
          {tenant?.img ? (
            <img
              src={tenant?.img} alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.55) saturate(1.15)',
                transform: 'scale(1.02)',
              }}
            />
          ) : (
            // Pas de photo — fond vivant généré depuis la couleur
            <div style={{
              position: 'absolute', inset: 0,
              background: `
                radial-gradient(ellipse 120% 100% at 60% 0%, ${c}28 0%, transparent 55%),
                radial-gradient(ellipse 80% 80% at 0% 100%, ${c}14 0%, transparent 60%),
                linear-gradient(160deg, #0f0f14 0%, #07070a 100%)
              `,
            }}>
              {/* Initiales monumentales */}
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -58%)',
                fontSize: isMobile ? 110 : 130,
                fontWeight: 900,
                fontFamily: F.h,
                color: c,
                opacity: 0.18,
                letterSpacing: '-0.05em',
                lineHeight: 1,
                userSelect: 'none',
              }}>{tenant?.l}</div>
            </div>
          )}

          {/* Vignette : dégradé vers le bas pour lisibilité du texte */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `
              linear-gradient(to top,
                #0a0a0d 0%,
                rgba(10,10,13,0.75) 35%,
                rgba(10,10,13,0.15) 70%,
                transparent 100%
              )
            `,
          }} />

          {/* Lueur couleur en haut à droite — atmosphère */}
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 240, height: 240,
            borderRadius: '50%',
            background: `${c}16`,
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }} />

          {/* ── Barre du haut : badge type + close ── */}
          <div style={{
            position: 'absolute', top: isMobile ? 18 : 16,
            left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: `0 ${px}px`,
          }}>
            {/* Handle mobile */}
            {isMobile ? (
              <div style={{
                position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                width: 38, height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.18)',
              }} />
            ) : null}

            {/* Badge profil : qui est cette personne */}
            {profileLabel ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 20,
                background: 'rgba(0,0,0,0.52)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${c}30`,
                fontSize: 10, fontWeight: 700,
                color: c, letterSpacing: '0.05em',
                marginTop: isMobile ? 12 : 0,
              }}>
                ✦ {profileLabel}
              </div>
            ) : <div />}

            {/* Close */}
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              border: `1px solid rgba(255,255,255,0.12)`,
              color: 'rgba(255,255,255,0.65)',
              cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: isMobile ? 12 : 0,
            }}>×</button>
          </div>

          {/* ── Identité superposée sur la photo ── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: `0 ${px}px ${isMobile ? 22 : 26}px`,
          }}>
            {/* Nom — la vraie star de ce profil */}
            <div style={{
              fontSize: isMobile ? 30 : 34,
              fontWeight: 900,
              fontFamily: F.h,
              color: '#fff',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              textShadow: '0 2px 24px rgba(0,0,0,0.7)',
              marginBottom: 8,
            }}>
              {tenant?.name}
            </div>

            {/* Slogan — citation personnelle, pas un tagline produit */}
            {tenant?.slogan && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
              }}>
                <span style={{
                  fontSize: 18, lineHeight: 1,
                  color: c, opacity: 0.8,
                  fontFamily: 'Georgia, serif',
                  marginTop: 1, flexShrink: 0,
                }}>"</span>
                <span style={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: 13, lineHeight: 1.55,
                  fontStyle: 'italic',
                  maxWidth: 320,
                }}>
                  {tenant?.slogan}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══ CORPS — infos personnelles ═══ */}
        <div style={{ padding: `20px ${px}px ${isMobile ? 36 : 28}px` }}>

          {/* ── Réseaux + Like — "comment me trouver" ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 22,
            flexWrap: 'wrap',
          }}>
            {/* Réseaux sociaux du profil annonceur */}
            {[
              tenant?.instagramUrl && { href: tenant?.instagramUrl, label: 'Instagram', icon: '📸', color: '#e1306c' },
              tenant?.tiktokUrl    && { href: tenant?.tiktokUrl,    label: 'TikTok',    icon: '🎵', color: '#00f2ea' },
              tenant?.twitterUrl   && { href: tenant?.twitterUrl,   label: 'X',         icon: '𝕏',  color: '#e7e9ea' },
              tenant?.youtubeUrl   && { href: tenant?.youtubeUrl,   label: 'YouTube',   icon: '▶',  color: '#ff0000' },
              tenant?.linkedinUrl  && { href: tenant?.linkedinUrl,  label: 'LinkedIn',  icon: 'in', color: '#0077b5' },
              // Fallback : réseau lié au bloc (ancien comportement)
              !tenant?.instagramUrl && !tenant?.tiktokUrl && !tenant?.twitterUrl && !tenant?.youtubeUrl && !tenant?.linkedinUrl
                && socialMeta && tenant?.social && {
                  href: `${socialMeta.prefix}${tenant?.social.replace('@', '')}`,
                  label: `@${tenant?.social.replace('@', '')}`,
                  icon: socialMeta.icon,
                  color: socialMeta.color,
                },
              !tenant?.instagramUrl && !tenant?.tiktokUrl && !tenant?.twitterUrl && !tenant?.youtubeUrl && !tenant?.linkedinUrl
                && musicMeta && tenant?.music && {
                  href: `${musicMeta.prefix}${tenant?.music.replace('@', '')}`,
                  label: musicMeta.label,
                  icon: musicMeta.icon,
                  color: musicMeta.color,
                },
            ].filter(Boolean).map((link, i) => (
              <a
                key={i}
                href={link.href}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 30,
                  background: `${link.color}12`,
                  border: `1px solid ${link.color}28`,
                  color: link.color,
                  fontSize: 12, fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'background 0.18s, border-color 0.18s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${link.color}22`;
                  e.currentTarget.style.borderColor = `${link.color}50`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `${link.color}12`;
                  e.currentTarget.style.borderColor = `${link.color}28`;
                }}
              >
                <span style={{ fontSize: 14 }}>{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Like — geste affectif */}
            <button
              onClick={handleLike}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 30,
                cursor: 'pointer', fontFamily: F.b, fontSize: 13,
                background: liked ? `${c}18` : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${liked ? c + '45' : 'rgba(255,255,255,0.09)'}`,
                color: liked ? c : 'rgba(255,255,255,0.35)',
                transition: 'all 0.22s',
                transform: likeAnim ? 'scale(1.1)' : 'scale(1)',
                flexShrink: 0,
              }}
            >
              <span style={{
                fontSize: 16,
                display: 'inline-block',
                transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                transform: likeAnim ? 'scale(1.5)' : 'scale(1)',
              }}>
                {liked ? '♥' : '♡'}
              </span>
              {likeCount > 0 && (
                <span style={{ fontSize: 11 }}>{likeCount}</span>
              )}
            </button>
          </div>

          {/* Séparateur fin coloré */}
          <div style={{
            height: 1,
            background: `linear-gradient(90deg, ${c}30 0%, ${c}08 60%, transparent 100%)`,
            marginBottom: 24,
          }} />

          {/* ── Description — l'histoire de l'auteur ── */}
          {tenant?.description && (
            <div style={{ marginBottom: 24 }}>
              <p style={{
                color: 'rgba(255,255,255,0.62)',
                fontSize: 13.5,
                lineHeight: 1.75,
                margin: 0,
                whiteSpace: 'pre-line',
                // Limiter à 6 lignes sur mobile avec fade si trop long
              }}>
                {tenant?.description}
              </p>
            </div>
          )}

          {/* ── Sur la grille — ses blocs vus comme des "posts" ── */}
          {advertiserSlots.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 9, fontWeight: 700,
                color: 'rgba(255,255,255,0.28)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 14, height: 1, background: c, opacity: 0.45 }} />
                {advertiserSlots.length > 1
                  ? `${advertiserSlots.length} espaces sur la grille`
                  : 'Son espace sur la grille'}
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {advertiserSlots.map((s, idx) => {
                  const sc = s.tenant?.c || TIER_COLOR[s.tier];
                  return (
                    <button
                      key={s.id}
                      onClick={() => { onClose(); setTimeout(() => onOpenSlot(s), 60); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '11px 14px', borderRadius: 14,
                        background: idx === 0 ? `${sc}0e` : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${idx === 0 ? sc + '28' : 'rgba(255,255,255,0.06)'}`,
                        cursor: 'pointer', fontFamily: F.b, textAlign: 'left',
                        transition: 'all 0.18s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${sc}18`;
                        e.currentTarget.style.borderColor = `${sc}45`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = idx === 0 ? `${sc}0e` : 'rgba(255,255,255,0.025)';
                        e.currentTarget.style.borderColor = idx === 0 ? `${sc}28` : 'rgba(255,255,255,0.06)';
                      }}
                    >
                      {/* Vignette du bloc */}
                      <div style={{
                        width: 46, height: 46, borderRadius: 11,
                        flexShrink: 0,
                        background: s.tenant?.img
                          ? `url(${s.tenant?.img}) center/cover`
                          : `linear-gradient(140deg, ${sc}30, ${sc}10)`,
                        border: `1.5px solid ${sc}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 17, fontWeight: 900, color: sc,
                        overflow: 'hidden',
                      }}>
                        {!s.tenant?.img && (s.tenant?.l || '?')}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Tier badge mini */}
                        <div style={{
                          display: 'inline-flex', alignItems: 'center',
                          gap: 5, marginBottom: 3,
                        }}>
                          <div style={{
                            fontSize: 8, fontWeight: 800,
                            color: sc, letterSpacing: '0.07em',
                            padding: '1px 5px', borderRadius: 3,
                            background: `${sc}15`,
                          }}>
                            {TIER_LABEL[s.tier]}
                          </div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>
                            pos. {s.x},{s.y}
                          </div>
                        </div>
                        <div style={{
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: 11, lineHeight: 1.4,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {s.tenant?.slogan || s.tenant?.cta || 'Voir le bloc'}
                        </div>
                      </div>

                      <div style={{
                        color: sc, fontSize: 18,
                        opacity: 0.5, flexShrink: 0,
                        lineHeight: 1,
                      }}>›</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Reach — présence discrète, pas mise en avant ── */}
          {totalStats && totalStats.impressions_7d > 0 && (
            <div style={{
              marginBottom: 24,
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-around', gap: 8,
            }}>
              {[
                { v: (totalStats.impressions_7d || 0).toLocaleString('fr-FR'), l: 'vues / 7j' },
                { v: (totalStats.clicks_7d || 0).toLocaleString('fr-FR'),      l: 'visites' },
                { v: `${totalStats.ctr_pct ?? 0}%`,                             l: 'engagement' },
              ].map(({ v, l }) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800,
                    color: 'rgba(255,255,255,0.7)',
                    fontFamily: F.h, lineHeight: 1,
                    marginBottom: 4,
                  }}>{v}</div>
                  <div style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.25)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── CTA — invitation, pas conversion ── */}
          {tenant?.url && tenant?.url !== '#' && (
            <a
              href={tenant?.url}
              target="_blank" rel="noopener noreferrer"
              onClick={() => recordClick(mainSlot.x, mainSlot.y, tenant?.bookingId)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', padding: '14px 20px',
                borderRadius: 14,
                background: `linear-gradient(135deg, ${ctaBg} 0%, ${ctaBg}cc 100%)`,
                color: ctaFg,
                fontWeight: 800, fontSize: 14, fontFamily: F.b,
                textDecoration: 'none',
                letterSpacing: '0.01em',
                boxShadow: `0 4px 28px ${ctaBg}38`,
                transition: 'transform 0.18s, box-shadow 0.18s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 8px 36px ${ctaBg}55`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 28px ${ctaBg}38`;
              }}
            >
              {tenant?.cta || 'Découvrir son univers'}
              <span style={{ fontSize: 17, lineHeight: 1 }}>→</span>
            </a>
          )}

          {/* Espace respiration bas */}
          <div style={{ height: isMobile ? 8 : 2 }} />
        </div>
      </div>
    </div>
  );
}


// ─── ShareBlocButton ───────────────────────────────────────────
function ShareBlocButton({ x, y, name, slogan }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://adsmostfair.com'}/bloc/${x}-${y}`;
    if (navigator?.share) {
      try {
        await navigator.share({ title: name ? `${name} sur ADSMostFair` : 'Bloc ADSMostFair', text: slogan || name || '', url });
        return;
      } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silent */ }
  };

  return (
    <button
      onClick={e => { e.stopPropagation(); handleShare(); }}
      style={{
        width: '100%', padding: '10px', borderRadius: 9,
        background: 'transparent', border: `1px solid ${U.border2}`,
        color: copied ? '#00e8a2' : U.muted,
        fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'color 0.2s',
      }}
    >
      {copied ? <><span>✓</span> Lien copié !</> : <><span style={{ fontSize: 14 }}>⎘</span> Partager ce bloc</>}
    </button>
  );
}

// ─── PreviewPlayer — mini player 30s pour vidéo & musique ──────
function PreviewPlayer({ tenant, isMobile }) {
  const [open, setOpen] = useState(false);
  const url = tenant?.url || '';
  const c   = tenant?.c || '#00d9f5';
  const t   = tenant?.t;

  // Résoudre l'URL d'embed selon la plateforme
  let embedUrl = null;
  let embedH   = 80;
  let label    = null;
  let icon     = null;

  if (t === 'video') {
    const yt    = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    const tt    = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (yt) {
      embedUrl = `https://www.youtube.com/embed/${yt[1]}?autoplay=1&start=0&end=30&rel=0&modestbranding=1`;
      embedH   = isMobile ? 200 : 240;
      label    = 'Aperçu 30s — YouTube';
      icon     = '▶';
    } else if (vimeo) {
      embedUrl = `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1#t=0,30`;
      embedH   = isMobile ? 200 : 240;
      label    = 'Aperçu 30s — Vimeo';
      icon     = '▶';
    } else if (tt) {
      embedUrl = `https://www.tiktok.com/embed/v2/${tt[1]}`;
      embedH   = isMobile ? 320 : 380;
      label    = 'Aperçu TikTok';
      icon     = '🎵';
    }
  } else if (t === 'music') {
    const spotify  = url.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
    const sc       = url.includes('soundcloud.com');
    const ytm      = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    const deezer   = url.match(/deezer\.com\/[a-z]+\/track\/(\d+)/);
    if (spotify) {
      embedUrl = `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}?utm_source=generator&theme=0`;
      embedH   = 152;
      label    = 'Écouter sur Spotify';
      icon     = '🎵';
    } else if (sc) {
      embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%231ed760&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
      embedH   = 80;
      label    = 'Écouter sur SoundCloud';
      icon     = '☁';
    } else if (ytm) {
      embedUrl = `https://www.youtube.com/embed/${ytm[1]}?autoplay=1&start=0&end=30&rel=0&modestbranding=1`;
      embedH   = isMobile ? 180 : 200;
      label    = 'Aperçu 30s — YouTube Music';
      icon     = '▶';
    } else if (deezer) {
      embedUrl = `https://widget.deezer.com/widget/dark/track/${deezer[1]}`;
      embedH   = 100;
      label    = 'Écouter sur Deezer';
      icon     = '🎶';
    }
  }

  if (!embedUrl) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {!open ? (
        // ── Bouton "Aperçu" fermé ──
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px', borderRadius: 10,
            background: `${c}10`, border: `1.5px solid ${c}35`,
            color: '#fff', cursor: 'pointer', fontFamily: F.b,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${c}1e`; e.currentTarget.style.borderColor = `${c}60`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${c}10`; e.currentTarget.style.borderColor = `${c}35`; }}
        >
          {/* Icône cercle */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 16px ${c}60` }}>
            <span style={{ fontSize: 16, color: '#000', paddingLeft: t === 'video' ? '12%' : 0 }}>{icon}</span>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {t === 'video' ? 'Aperçu 30 secondes' : 'Lecture intégrée'}
            </div>
          </div>
          {/* Badge durée */}
          {t === 'video' && (
            <div style={{ padding: '3px 8px', borderRadius: 20, background: `${c}20`, border: `1px solid ${c}40`, color: c, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              ▶ 0:30
            </div>
          )}
        </button>
      ) : (
        // ── Player ouvert ──
        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${c}40`, position: 'relative', boxShadow: `0 0 32px ${c}20` }}>
          {/* Barre top avec bouton fermer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: `${c}12`, borderBottom: `1px solid ${c}20` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block', animation: 'blink 1.5s infinite', boxShadow: `0 0 6px ${c}` }} />
              {label}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
            >×</button>
          </div>
          <iframe
            src={embedUrl}
            width="100%" height={embedH}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            style={{ display: 'block', background: '#000' }}
          />
        </div>
      )}
    </div>
  );
}

// ─── AdViewModal — modal publicitaire pour blocs occupés ──────
// Design identique à CheckoutModal, adapté par catégorie de contenu
function AdViewModal({ slot, allSlots, onClose, onNavigate, onViewProfile, onGoAdvertiser }) {
  const [entered, setEntered] = useState(false);
  const [dir, setDir]         = useState(0);
  const { isMobile }          = useScreenSize();
  const [publicStats, setPublicStats] = useState(null);
  const [liked, setLiked]     = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);

  const occupiedSlots = useMemo(() => allSlots.filter(s => s.occ), [allSlots]);
  const curIdx  = occupiedSlots.findIndex(s => s.id === slot?.id);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx < occupiedSlots.length - 1;
  const goPrev  = useCallback(() => { if (!hasPrev) return; setDir(-1); onNavigate(occupiedSlots[curIdx - 1]); setTimeout(() => setDir(0), 250); }, [hasPrev, curIdx, occupiedSlots, onNavigate]);
  const goNext  = useCallback(() => { if (!hasNext) return; setDir(1); onNavigate(occupiedSlots[curIdx + 1]); setTimeout(() => setDir(0), 250); }, [hasNext, curIdx, occupiedSlots, onNavigate]);

  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, [slot]);
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); };
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    if (!slot?.occ || !slot?.tenant?.bookingId) return;
    fetch('/api/track', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slotX: slot.x, slotY: slot.y, bookingId: slot.tenant?.bookingId, event:'impression' }) }).catch(()=>{});
    fetchSlotStats(slot.x, slot.y).then(({data}) => setPublicStats(data)).catch(()=>{});
    try { setLiked(localStorage.getItem(`like_slot_${slot.id}`) === '1'); } catch {}
  }, [slot?.id]);

  if (!slot || !slot.occ) return null;
  const { tier, tenant } = slot;
  const c  = tenant?.c || TIER_COLOR[tier];
  const t  = tenant?.t;
  const px = isMobile ? 18 : 24;

  const handleLike = (e) => {
    e.stopPropagation();
    const nl = !liked;
    try { localStorage.setItem(`like_slot_${slot.id}`, nl ? '1' : '0'); } catch {}
    setLiked(nl);
    if (nl) { setLikeAnim(true); setTimeout(() => setLikeAnim(false), 600); }
  };

  // ── Résolution embed ──
  const yt    = tenant?.url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  const vimeo = tenant?.url?.match(/vimeo\.com\/(\d+)/);
  const tiktokV = tenant?.url?.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  const spotify = tenant?.url?.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  const soundcloud = tenant?.url?.includes('soundcloud.com');
  const deezer  = tenant?.url?.match(/deezer\.com\/[a-z]+\/track\/(\d+)/);

  const SOCIAL_META = {
    instagram:{ label:'Instagram', icon:'📸', color:'#e1306c', base:'https://instagram.com/' },
    tiktok:   { label:'TikTok',    icon:'🎵', color:'#69c9d0', base:'https://tiktok.com/@' },
    youtube:  { label:'YouTube',   icon:'▶',  color:'#ff0000', base:'https://youtube.com/@' },
    twitter:  { label:'X / Twitter',icon:'✕', color:'#1da1f2', base:'https://x.com/' },
    x:        { label:'X',         icon:'✕',  color:'#1da1f2', base:'https://x.com/' },
    linkedin: { label:'LinkedIn',  icon:'in', color:'#0a66c2', base:'https://linkedin.com/in/' },
    facebook: { label:'Facebook',  icon:'f',  color:'#1877f2', base:'https://facebook.com/' },
    snapchat: { label:'Snapchat',  icon:'👻', color:'#fffc00', base:'https://snapchat.com/add/' },
    twitch:   { label:'Twitch',    icon:'🎮', color:'#9146ff', base:'https://twitch.tv/' },
    discord:  { label:'Discord',   icon:'💬', color:'#5865f2', base:'https://discord.gg/' },
  };
  const MUSIC_META = {
    spotify:     { label:'Spotify',     icon:'🎵', color:'#1ed760' },
    apple_music: { label:'Apple Music', icon:'🍎', color:'#fc3c44' },
    soundcloud:  { label:'SoundCloud',  icon:'☁',  color:'#ff5500' },
    deezer:      { label:'Deezer',      icon:'🎶', color:'#a238ff' },
    youtube_music:{ label:'YT Music',   icon:'▶',  color:'#ff0000' },
    bandcamp:    { label:'Bandcamp',    icon:'🎸', color:'#1da0c3' },
  };
  const socialMeta = SOCIAL_META[tenant?.social];
  const musicMeta  = MUSIC_META[tenant?.music];
  const storeCol   = APP_STORE_COLORS[tenant?.appStore] || c;

  // ─── Zone MÉDIA selon catégorie ──────────────────────────────
  function MediaZone() {
    // VIDEO — embed YouTube/Vimeo ou thumbnail+play
    if (t === 'video') {
      if (yt) return (
        <div style={{ position:'relative', width:'100%', paddingBottom:'56.25%', background:'#000', borderRadius:isMobile?0:12, overflow:'hidden', border:`1px solid ${c}30` }}>
          <iframe src={`https://www.youtube.com/embed/${yt[1]}?autoplay=0&rel=0&modestbranding=1`}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
            frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      );
      if (vimeo) return (
        <div style={{ position:'relative', width:'100%', paddingBottom:'56.25%', background:'#000', borderRadius:12, overflow:'hidden', border:`1px solid ${c}30` }}>
          <iframe src={`https://player.vimeo.com/video/${vimeo[1]}?autoplay=0`}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
            frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      );
      if (tiktokV) return (
        <div style={{ display:'flex', justifyContent:'center', borderRadius:12, overflow:'hidden' }}>
          <iframe src={`https://www.tiktok.com/embed/v2/${tiktokV[1]}`}
            style={{ width:'100%', maxWidth:340, height:600, border:'none' }} scrolling="no" />
        </div>
      );
      // Fallback thumbnail
      return (
        <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', background:tenant?.b||'#0a0a14', borderRadius:12, overflow:'hidden', border:`1px solid ${c}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {tenant?.img && <img src={tenant?.img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.5 }} />}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.6))' }} />
          <a href={tenant?.url} target="_blank" rel="noopener noreferrer"
            onClick={() => recordClick(slot.x, slot.y, tenant?.bookingId)}
            style={{ position:'relative', width:72, height:72, borderRadius:'50%', background:'rgba(0,0,0,0.7)', border:`2.5px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:`0 0 40px ${c}70` }}>
            <span style={{ color:c, fontSize:30, lineHeight:1, paddingLeft:'14%' }}>▶</span>
          </a>
        </div>
      );
    }

    // MUSIQUE — lecteur intégré Spotify/SoundCloud/Deezer ou UI musicale
    if (t === 'music') {
      const col = musicMeta?.color || MUSIC_COLORS_MAP[tenant?.music] || c;
      if (spotify) return (
        <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${col}40` }}>
          <iframe src={`https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}?utm_source=generator&theme=0`}
            width="100%" height={152} frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
        </div>
      );
      if (soundcloud) return (
        <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${col}40` }}>
          <iframe width="100%" height={120} scrolling="no" frameBorder="no"
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(tenant?.url)}&color=%23${col.slice(1)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`} />
        </div>
      );
      if (deezer) return (
        <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${col}40` }}>
          <iframe src={`https://widget.deezer.com/widget/dark/track/${deezer[1]}`} width="100%" height={100} frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
        </div>
      );
      // UI musicale custom
      const bars = [0.55,1,0.7,0.9,0.45,0.8,0.65];
      return (
        <div style={{ padding:'24px', borderRadius:12, background:`radial-gradient(ellipse at 50% 30%, ${col}22, ${col}05 60%, ${tenant?.b||'#0a0a14'} 100%)`, border:`1px solid ${col}30`, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
          {tenant?.img
            ? <img src={tenant?.img} alt="" style={{ width:96, height:96, borderRadius:14, objectFit:'cover', border:`2px solid ${col}60`, boxShadow:`0 12px 40px rgba(0,0,0,0.6), 0 0 24px ${col}50` }} />
            : <div style={{ width:96, height:96, borderRadius:14, background:`${col}20`, border:`2px solid ${col}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:38, color:col }}>{MUSIC_ICONS_MAP[tenant?.music]||'🎵'}</div>
          }
          <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:32 }}>
            {bars.map((h,i)=>(<div key={i} style={{ width:5, borderRadius:3, background:col, height:32*h, animation:`eqBar${i%5} ${0.38+i*0.11}s ease-in-out infinite alternate`, boxShadow:`0 0 6px ${col}80` }} />))}
          </div>
          <a href={tenant?.url} target="_blank" rel="noopener noreferrer" onClick={()=>recordClick(slot.x,slot.y,tenant?.bookingId)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', borderRadius:24, background:`${col}20`, border:`1.5px solid ${col}50`, color:col, fontWeight:700, fontSize:12, textDecoration:'none', letterSpacing:'0.04em' }}>
            <span style={{ fontSize:14 }}>{musicMeta?.icon||'♪'}</span>
            Écouter sur {musicMeta?.label||'la plateforme'}
          </a>
        </div>
      );
    }

    // IMAGE / MARQUE / LIFESTYLE / VÊTEMENTS — image full-bleed
    if (tenant?.img && (t === 'image' || t === 'brand' || t === 'lifestyle' || t === 'clothing')) {
      return (
        <div style={{ position:'relative', borderRadius:12, overflow:'hidden', border:`1px solid ${c}30`, aspectRatio: t==='clothing'?'3/4':'16/10' }}>
          <img src={tenant?.img} alt={tenant?.name||''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${c}15, transparent 60%)` }} />
          {t === 'clothing' && tenant?.slogan && (
            <div style={{ position:'absolute', top:14, right:14, padding:'7px 14px', borderRadius:20, background:'rgba(0,0,0,0.85)', color:'#fff', fontSize:14, fontWeight:900, backdropFilter:'blur(10px)', border:'1.5px solid rgba(255,255,255,0.2)' }}>{tenant?.slogan}</div>
          )}
        </div>
      );
    }

    // PUBLICATION (text) — article editorial
    if (t === 'text') {
      return (
        <div style={{ padding:'20px 22px', borderRadius:12, background:tenant?.b||'#0d1828', border:`1px solid ${c}30`, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 22px,${c}06 22px,${c}06 23px)` }} />
          <div style={{ position:'relative' }}>
            <div style={{ width:'35%', height:2, background:`linear-gradient(90deg, ${c}, ${c}30)`, borderRadius:1, marginBottom:14 }} />
            <div style={{ fontSize:16, fontWeight:900, color:c, lineHeight:1.35, letterSpacing:'-0.02em', marginBottom:12 }}>{tenant?.name||'Article'}</div>
            {tenant?.slogan && <div style={{ fontSize:12, color:`${c}80`, lineHeight:1.6, marginBottom:14, fontStyle:'italic' }}>{tenant?.slogan}</div>}
            {tenant?.description && <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.75, display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{tenant?.description}</div>}
            <div style={{ marginTop:16, width:'22%', height:1.5, background:`linear-gradient(90deg, ${c}50, transparent)`, borderRadius:1 }} />
          </div>
        </div>
      );
    }

    // RÉSEAUX SOCIAUX — grande icône plateforme + gradient
    if (t === 'social') {
      const col = SOCIAL_COLORS_MAP[tenant?.social] || c;
      const ico = SOCIAL_ICONS_MAP[tenant?.social] || '⊕';
      return (
        <div style={{ padding:'28px', borderRadius:12, background:`radial-gradient(ellipse at 50% 35%, ${col}28, ${col}06 55%, ${tenant?.b||'#0a0a14'} 100%)`, border:`1px solid ${col}30`, display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
          <div style={{ fontSize:72, filter:`drop-shadow(0 0 24px ${col}90)` }}>{ico}</div>
          {tenant?.name && <div style={{ fontSize:15, fontWeight:700, color:col, textAlign:'center' }}>{tenant?.name}</div>}
          <a href={tenant?.url||`${socialMeta?.base||'#'}${(tenant?.social||'').replace('@','')}`} target="_blank" rel="noopener noreferrer" onClick={()=>recordClick(slot.x,slot.y,tenant?.bookingId)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 20px', borderRadius:24, background:`${col}20`, border:`1.5px solid ${col}55`, color:col, fontWeight:700, fontSize:12, textDecoration:'none', letterSpacing:'0.03em' }}>
            <span style={{ fontSize:14 }}>{ico}</span>
            Voir le profil
          </a>
        </div>
      );
    }

    // APP — icône style App Store + badge store
    if (t === 'app') {
      return (
        <div style={{ padding:'24px', borderRadius:12, background:`linear-gradient(135deg, ${tenant?.b||U.s2} 0%, ${U.s2} 100%)`, border:`1px solid ${storeCol}30`, display:'flex', flexDirection:'column', alignItems:'center', gap:16, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 50% 110%, ${storeCol}30, transparent 60%)` }} />
          {tenant?.img
            ? <img src={tenant?.img} alt="" style={{ position:'relative', width:100, height:100, borderRadius:22, objectFit:'cover', border:`2.5px solid ${storeCol}50`, boxShadow:`0 16px 48px rgba(0,0,0,0.6), 0 0 32px ${storeCol}35` }} />
            : <div style={{ position:'relative', width:100, height:100, borderRadius:22, background:`${storeCol}22`, border:`2.5px solid ${storeCol}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, fontWeight:900, color:storeCol, fontFamily:F.h }}>{tenant?.l}</div>
          }
          <div style={{ position:'relative', display:'flex', alignItems:'center', gap:7, padding:'7px 16px', borderRadius:20, background:'rgba(0,0,0,0.6)', border:`1px solid ${storeCol}40`, backdropFilter:'blur(8px)' }}>
            <span style={{ fontSize:14 }}>{tenant?.appStore==='app_store'?'🍎':tenant?.appStore==='google_play'?'▶':'🌐'}</span>
            <span style={{ color:storeCol, fontSize:12, fontWeight:700 }}>{tenant?.appStore==='app_store'?'App Store':tenant?.appStore==='google_play'?'Google Play':'Disponible sur le web'}</span>
          </div>
          {tenant?.slogan && <div style={{ position:'relative', fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'center' }}>{tenant?.slogan}</div>}
        </div>
      );
    }

    // LIEN — preview enrichie
    if (tenant?.img) return (
      <div style={{ position:'relative', borderRadius:12, overflow:'hidden', border:`1px solid ${c}30` }}>
        <img src={tenant?.img} alt={tenant?.name||''} style={{ width:'100%', objectFit:'cover', display:'block', maxHeight:220 }} />
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${tenant?.b||U.s1} 0%, transparent 55%)` }} />
      </div>
    );

    // Défaut — initiales monumentales
    return (
      <div style={{ padding:'36px 24px', borderRadius:12, background:`radial-gradient(ellipse at 50% 30%, ${c}18, ${c}04 60%, ${tenant?.b||'#0a0a14'} 100%)`, border:`1px solid ${c}25`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
        <div style={{ fontSize:80, fontWeight:900, color:c, fontFamily:F.h, lineHeight:1, textShadow:`0 0 60px ${c}60`, letterSpacing:'-0.04em' }}>{tenant?.l||'?'}</div>
        {tenant?.name && <div style={{ fontSize:13, fontWeight:700, color:`${c}cc`, textAlign:'center', maxWidth:'80%' }}>{tenant?.name}</div>}
      </div>
    );
  }

  // ─── Liens sociaux de l'annonceur ────────────────────────────
  const socialLinks = [
    tenant?.instagramUrl && { href:tenant?.instagramUrl, label:'Instagram', icon:'📸', color:'#e1306c' },
    tenant?.tiktokUrl    && { href:tenant?.tiktokUrl,    label:'TikTok',    icon:'🎵', color:'#69c9d0' },
    tenant?.twitterUrl   && { href:tenant?.twitterUrl,   label:'X',         icon:'✕',  color:'#1da1f2' },
    tenant?.youtubeUrl   && { href:tenant?.youtubeUrl,   label:'YouTube',   icon:'▶',  color:'#ff0000' },
    tenant?.linkedinUrl  && { href:tenant?.linkedinUrl,  label:'LinkedIn',  icon:'in', color:'#0a66c2' },
    // Fallback réseau lié au bloc
    !tenant?.instagramUrl && !tenant?.tiktokUrl && !tenant?.twitterUrl && !tenant?.youtubeUrl && !tenant?.linkedinUrl && socialMeta && tenant?.social && {
      href: tenant?.url?.includes(socialMeta.base?.split('//')[1]?.split('/')[0]||'xxx') ? tenant?.url : `${socialMeta.base}${(tenant?.social||'').replace('@','')}`,
      label: socialMeta.label, icon: socialMeta.icon, color: socialMeta.color,
    },
    !tenant?.instagramUrl && !tenant?.tiktokUrl && !tenant?.twitterUrl && !tenant?.youtubeUrl && !tenant?.linkedinUrl && musicMeta && tenant?.music && {
      href: tenant?.url, label: musicMeta.label, icon: musicMeta.icon, color: musicMeta.color,
    },
  ].filter(Boolean);

  const clipPath = isMobile ? 'none' : 'polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px))';

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,1,6,0.92)', backdropFilter:'blur(20px) saturate(180%)', display:'flex', alignItems:isMobile?'flex-end':'center', justifyContent:'center', opacity:entered?1:0, transition:'opacity 0.2s ease' }}>
      {/* Nav arrows desktop */}
      {!isMobile && hasPrev && (
        <button onClick={e=>{e.stopPropagation();goPrev();}} style={{ position:'fixed', left:'max(16px,calc(50% - 460px))', top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:'50%', background:U.s1, border:`1px solid ${U.border2}`, color:U.text, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2010 }}>‹</button>
      )}
      {!isMobile && hasNext && (
        <button onClick={e=>{e.stopPropagation();goNext();}} style={{ position:'fixed', right:'max(16px,calc(50% - 460px))', top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:'50%', background:U.s1, border:`1px solid ${U.border2}`, color:U.text, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2010 }}>›</button>
      )}

      {/* Scanlines */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,200,240,0.025) 2px,rgba(0,200,240,0.025) 3px)', pointerEvents:'none' }} />

      {/* Carte principale */}
      <div onClick={e=>e.stopPropagation()} style={{
        position:'relative',
        width: isMobile ? '100vw' : `min(96vw, 860px)`,
        background:'rgba(0,4,18,0.98)',
        border:`0.5px solid ${U.border2}`,
        clipPath,
        borderRadius: isMobile ? '20px 20px 0 0' : 0,
        overflow:'hidden',
        maxHeight: isMobile ? '93vh' : '88vh',
        transform: entered
          ? `translateX(${dir*-10}px)`
          : isMobile ? 'translateY(32px)' : 'translateY(18px) scale(0.97)',
        transition:'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
        boxShadow:`0 0 80px ${c}14, 0 32px 80px rgba(0,0,0,0.95)`,
      }}>
        {/* Barre énergie couleur annonceur */}
        <div style={{ height:1.5, background:`linear-gradient(90deg,transparent,${c},${c}88,transparent)`, boxShadow:`0 0 8px ${c}` }} />

        {/* Coins lumineux */}
        {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],i) => (
          <div key={i} style={{ position:'absolute', [v]:6, [h]:6, width:10, height:10, borderTop:v==='top'?`1px solid ${c}55`:'none', borderBottom:v==='bottom'?`1px solid ${c}55`:'none', borderLeft:h==='left'?`1px solid ${c}55`:'none', borderRight:h==='right'?`1px solid ${c}55`:'none', pointerEvents:'none', zIndex:10 }} />
        ))}

        {/* Bouton fermer */}
        <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:28, height:28, clipPath:'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))', border:`0.5px solid ${U.rose}33`, background:'transparent', color:`${U.rose}88`, cursor:'pointer', fontSize:12, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .10s', fontFamily:F.mono }}
          onMouseEnter={e=>{e.currentTarget.style.color=U.rose;e.currentTarget.style.borderColor=`${U.rose}66`;}}
          onMouseLeave={e=>{e.currentTarget.style.color=`${U.rose}88`;e.currentTarget.style.borderColor=`${U.rose}33`;}}>✕</button>

        {/* Handle mobile */}
        {isMobile && <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}><div style={{ width:36, height:3, borderRadius:2, background:U.border2 }} /></div>}

        {/* ── Layout 2 colonnes desktop / 1 colonne mobile ── */}
        <div style={{ display:'flex', flexDirection:isMobile?'column':'row', maxHeight:isMobile?'90vh':'85vh', overflowY:isMobile?'auto':'hidden' }}>

          {/* ── COLONNE GAUCHE : MÉDIA ── */}
          <div style={{
            width: isMobile ? '100%' : 380,
            flexShrink: 0,
            padding: isMobile ? '16px 16px 0' : '28px 24px',
            overflowY: isMobile ? 'visible' : 'auto',
            display:'flex', flexDirection:'column', gap:16,
            background: isMobile ? 'transparent' : `${c}04`,
            borderRight: isMobile ? 'none' : `1px solid ${U.border}`,
          }}>
            {/* Badge tier + position */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ padding:'2px 8px', borderRadius:4, background:`${TIER_COLOR[tier]}15`, border:`1px solid ${TIER_COLOR[tier]}30`, color:TIER_COLOR[tier], fontSize:9, fontWeight:700, letterSpacing:'0.06em' }}>{TIER_LABEL[tier]}</div>
              <div style={{ color:U.muted, fontSize:10, fontFamily:F.mono }}>·  pos. {slot.x},{slot.y}</div>
              {/* Navigation mobile */}
              {isMobile && (hasPrev || hasNext) && (
                <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                  {hasPrev && <button onClick={goPrev} style={{ width:28, height:28, borderRadius:'50%', background:U.s2, border:`1px solid ${U.border}`, color:U.muted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>‹</button>}
                  {hasNext && <button onClick={goNext} style={{ width:28, height:28, borderRadius:'50%', background:U.s2, border:`1px solid ${U.border}`, color:U.muted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>›</button>}
                </div>
              )}
            </div>

            {/* Zone média centrale */}
            <MediaZone />

            {/* Stats publiques sous le média */}
            {publicStats && (publicStats.impressions_7d > 0 || publicStats.clicks_7d > 0) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, padding:'10px 12px', borderRadius:10, background:`${c}06`, border:`1px solid ${c}14` }}>
                {[
                  [publicStats.impressions_7d?.toLocaleString('fr-FR')||'0', 'vues / 7j'],
                  [publicStats.clicks_7d?.toLocaleString('fr-FR')||'0', 'clics / 7j'],
                  [publicStats.ctr_pct!=null?`${publicStats.ctr_pct}%`:'—', 'CTR'],
                ].map(([v,l])=>(
                  <div key={l} style={{ textAlign:'center' }}>
                    <div style={{ color:c, fontWeight:800, fontSize:15, fontFamily:F.h, lineHeight:1 }}>{v}</div>
                    <div style={{ color:'rgba(255,255,255,0.35)', fontSize:8, marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── COLONNE DROITE : INFOS ── */}
          <div style={{ flex:1, padding:isMobile?'16px 16px 32px':'28px 28px 32px', overflowY:'auto', display:'flex', flexDirection:'column', gap:18 }}>

            {/* Identité annonceur */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
              {/* Avatar */}
              <div style={{ width:56, height:56, borderRadius:13, flexShrink:0, background:tenant?.img?`url(${tenant?.img}) center/cover`:`${c}18`, border:`1.5px solid ${c}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:c, fontFamily:F.h, overflow:'hidden' }}>
                {!tenant?.img && (tenant?.l||'?')}
              </div>
              {/* Nom + slogan + lien profil */}
              <div style={{ flex:1, minWidth:0 }}>
                <button onClick={()=>onViewProfile&&onViewProfile(tenant?.advertiserId)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left', display:'block', width:'100%' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                    <span style={{ color:U.text, fontWeight:800, fontSize:20, fontFamily:F.h, letterSpacing:'-0.02em' }}>{tenant?.name}</span>
                    <span style={{ color:c, fontSize:10, opacity:0.7 }}>↗ profil</span>
                  </div>
                </button>
                {tenant?.slogan && <div style={{ color:U.muted, fontSize:13, lineHeight:1.5 }}>{tenant?.slogan}</div>}
              </div>
              {/* Like */}
              <button onClick={handleLike} style={{ display:'flex', alignItems:'center', gap:4, padding:'7px 12px', borderRadius:24, cursor:'pointer', fontFamily:F.b, fontSize:13, background:liked?`${c}18`:'rgba(255,255,255,0.04)', border:`1.5px solid ${liked?c+'45':'rgba(255,255,255,0.09)'}`, color:liked?c:'rgba(255,255,255,0.35)', transition:'all 0.22s', transform:likeAnim?'scale(1.1)':'scale(1)', flexShrink:0 }}>
                <span style={{ fontSize:16, transition:'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', transform:likeAnim?'scale(1.5)':'scale(1)', display:'inline-block' }}>{liked?'♥':'♡'}</span>
              </button>
            </div>

            {/* Séparateur */}
            <div style={{ height:1, background:`linear-gradient(90deg, ${c}30, ${c}08 60%, transparent)` }} />

            {/* Description */}
            {tenant?.description && (
              <div style={{ padding:'14px 16px', borderRadius:11, background:`${c}06`, border:`1px solid ${c}14`, position:'relative' }}>
                <div style={{ position:'absolute', left:0, top:10, bottom:10, width:2.5, borderRadius:2, background:`linear-gradient(to bottom, ${c}70, ${c}15)` }} />
                <p style={{ margin:0, paddingLeft:12, color:'rgba(255,255,255,0.65)', fontSize:13, lineHeight:1.75, whiteSpace:'pre-line' }}>{tenant?.description}</p>
              </div>
            )}

            {/* Badge promo */}
            {tenant?.badge && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:7, background:`${c}10`, border:`1px solid ${c}20`, fontSize:11, color:c, fontWeight:700, alignSelf:'flex-start' }}>
                ✦ {tenant?.badge}
              </div>
            )}

            {/* Réseaux sociaux de l'annonceur */}
            {socialLinks.length > 0 && (
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.28)', letterSpacing:'0.14em', marginBottom:10 }}>RETROUVER SUR</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                  {socialLinks.map((link,i) => (
                    <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:24, background:`${link.color}12`, border:`1px solid ${link.color}28`, color:link.color, fontSize:12, fontWeight:700, textDecoration:'none', transition:'all 0.18s', letterSpacing:'0.01em' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=`${link.color}22`;e.currentTarget.style.borderColor=`${link.color}55`;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=`${link.color}12`;e.currentTarget.style.borderColor=`${link.color}28`;}}>
                      <span style={{ fontSize:14 }}>{link.icon}</span>
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Séparateur */}
            <div style={{ height:1, background:`linear-gradient(90deg, ${c}20, transparent)` }} />

            {/* Lien profil annonceur complet */}
            {tenant?.advertiserId && (
              <button onClick={()=>{onClose();setTimeout(()=>onViewProfile&&onViewProfile(tenant?.advertiserId),50);}}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:`1px solid rgba(255,255,255,0.07)`, cursor:'pointer', fontFamily:F.b, textAlign:'left', transition:'all 0.18s', width:'100%' }}
                onMouseEnter={e=>{e.currentTarget.style.background=`${c}0e`;e.currentTarget.style.borderColor=`${c}30`;}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.03)';e.currentTarget.style.borderColor='rgba(255,255,255,0.07)';}}>
                <div style={{ width:36, height:36, borderRadius:9, flexShrink:0, background:`${c}15`, border:`1px solid ${c}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, color:c, fontFamily:F.h, fontWeight:900 }}>{tenant?.l||'?'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:U.text, fontWeight:700, fontSize:12, marginBottom:2 }}>Voir le profil complet</div>
                  <div style={{ color:U.muted, fontSize:11 }}>Tous les blocs, stats et réseaux de <span style={{ color:c }}>{tenant?.name}</span></div>
                </div>
                <div style={{ color:c, fontSize:18, opacity:0.6, flexShrink:0 }}>›</div>
              </button>
            )}

            {/* CTA principal */}
            {tenant?.url && tenant?.url !== '#' && (
              <a href={tenant?.url} target="_blank" rel="noopener noreferrer"
                onClick={()=>recordClick(slot.x, slot.y, tenant?.bookingId)}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px 20px', borderRadius:12, background:`linear-gradient(135deg, ${c} 0%, ${c}cc 100%)`, color:U.accentFg, fontWeight:800, fontSize:14, fontFamily:F.b, textDecoration:'none', letterSpacing:'0.01em', boxShadow:`0 4px 28px ${c}38`, transition:'transform 0.18s, box-shadow 0.18s' }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow=`0 8px 36px ${c}55`;}}
                onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=`0 4px 28px ${c}38`;}}>
                {tenant?.cta || 'Découvrir'} →
              </a>
            )}

            {/* Bouton partager */}
            <ShareBlocButton x={slot.x} y={slot.y} name={tenant?.name} slogan={tenant?.slogan} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FocusModal({ slot, allSlots, onClose, onNavigate, onGoAdvertiser, onViewProfile, onWaitlist }) {
  const [entered, setEntered] = useState(false);
  const t = useT();
  const [dir, setDir] = useState(0);
  const { isMobile } = useScreenSize();
  const [publicStats, setPublicStats] = useState(null);

  // Fetch real stats for public display
  useEffect(() => {
    if (!slot?.occ) { setPublicStats(null); return; }
    fetchSlotStats(slot.x, slot.y).then(({ data }) => setPublicStats(data)).catch(() => {});
  }, [slot?.id]);
  const occupiedSlots = useMemo(() => allSlots.filter(s => s.occ), [allSlots]);
  const curIdx  = occupiedSlots.findIndex(s => s.id === slot?.id);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx < occupiedSlots.length - 1;
  const goPrev  = useCallback(() => { if (!hasPrev) return; setDir(-1); onNavigate(occupiedSlots[curIdx - 1]); setTimeout(() => setDir(0), 250); }, [hasPrev, curIdx, occupiedSlots, onNavigate]);
  const goNext  = useCallback(() => { if (!hasNext) return; setDir(1); onNavigate(occupiedSlots[curIdx + 1]); setTimeout(() => setDir(0), 250); }, [hasNext, curIdx, occupiedSlots, onNavigate]);
  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, [slot]);
  // Record impression on focus modal open — strong engagement signal
  useEffect(() => {
    if (!slot?.occ || !slot?.tenant?.bookingId) return;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotX: slot.x, slotY: slot.y, bookingId: slot.tenant?.bookingId, event: 'impression' }),
    }).catch(() => {});
  }, [slot?.id]);
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); };
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn);
  }, [slot, onClose, goPrev, goNext]);

  if (!slot) return null;
  const { tier, occ, tenant } = slot;
  const c = occ ? (tenant?.c || TIER_COLOR[tier]) : TIER_COLOR[tier];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', opacity: entered ? 1 : 0, transition: 'opacity 0.2s ease' }}>
      {/* Nav arrows */}
      {!isMobile && hasPrev && (
        <button onClick={e => { e.stopPropagation(); goPrev(); }} style={{ position: 'fixed', left: 'max(16px,calc(50% - 420px))', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: U.s1, border: `1px solid ${U.border2}`, color: U.text, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1020 }}>‹</button>
      )}
      {!isMobile && hasNext && (
        <button onClick={e => { e.stopPropagation(); goNext(); }} style={{ position: 'fixed', right: 'max(16px,calc(50% - 420px))', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: U.s1, border: `1px solid ${U.border2}`, color: U.text, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1020 }}>›</button>
      )}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        width: isMobile ? '100vw' : 'min(96vw,680px)',
        background: U.s1,
        border: `1px solid ${U.border2}`,
        borderRadius: isMobile ? '20px 20px 0 0' : 16,
        overflow: 'hidden', overflowY: 'auto',
        maxHeight: isMobile ? '88vh' : '88vh',
        transform: entered ? `translateX(${dir * -12}px)` : 'translateY(14px) scale(0.97)',
        transition: 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
      }}>
        {isMobile && <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}><div style={{ width: 36, height: 3, borderRadius: 2, background: U.border2 }} /></div>}

        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', border: `1px solid ${U.border}`, background: U.faint, color: U.muted, cursor: 'pointer', fontSize: 16, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>

        {/* Hero — adapté selon content_type */}
        {occ && tenant && tier !== 'viral' && (() => {
          const yt = tenant?.url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
          const vimeo = tenant?.url?.match(/vimeo\.com\/(\d+)/);

          // ▶ Vidéo : embed YouTube/Vimeo remplace l'image hero
          if (tenant?.t === 'video' && (yt || vimeo)) {
            const embedSrc = yt
              ? `https://www.youtube.com/embed/${yt[1]}?autoplay=0&rel=0&modestbranding=1`
              : `https://player.vimeo.com/video/${vimeo[1]}?autoplay=0`;
            return (
              <div style={{ position:'relative', height: isMobile ? 200 : 260, background:'#000', overflow:'hidden' }}>
                <iframe src={embedSrc} width="100%" height="100%" frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen style={{ display:'block' }} />
              </div>
            );
          }
          if (tenant?.t === 'video') {
            return (
              <div style={{ position:'relative', height: isMobile ? 180 : 240, overflow:'hidden', background:tenant?.b||'#0a0a0a' }}>
                {tenant?.img && <img src={tenant?.img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.55 }} />}
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.65))' }} />
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(0,0,0,0.7)', border:`2.5px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)', boxShadow:`0 0 40px ${c}60, 0 0 80px ${c}25` }}>
                    <span style={{ color:c, fontSize:28, lineHeight:1, paddingLeft:'14%' }}>▶</span>
                  </div>
                </div>
              </div>
            );
          }

          // ≡ Publication : barre colorée fine (pas de hero), typographie éditoriale
          if (tenant?.t === 'text') {
            return (
              <div style={{ padding:'20px 28px 0' }}>
                <div style={{ height:3, borderRadius:2, background:`linear-gradient(90deg, ${c}, ${c}60, transparent)`, marginBottom:2 }} />
              </div>
            );
          }

          // ⬡ App : fond dégradé + app icon grande centrée avec ombre
          if (tenant?.t === 'app') {
            const storeCol = APP_STORE_COLORS[tenant?.appStore] || c;
            return (
              <div style={{ height: isMobile ? 130 : 160, background:`linear-gradient(135deg, ${tenant?.b||U.s2} 0%, ${U.s2} 100%)`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 50% 110%, ${storeCol}30, transparent 65%)` }} />
                {tenant?.img
                  ? <img src={tenant?.img} alt="" style={{ width:88, height:88, borderRadius:22, objectFit:'cover', border:`2.5px solid ${storeCol}50`, boxShadow:`0 16px 48px rgba(0,0,0,0.6), 0 0 32px ${storeCol}35`, position:'relative' }} />
                  : <div style={{ width:88, height:88, borderRadius:22, background:`${storeCol}22`, border:`2.5px solid ${storeCol}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, fontWeight:900, color:storeCol, fontFamily:F.h, boxShadow:`0 16px 48px rgba(0,0,0,0.5), 0 0 32px ${storeCol}30`, position:'relative' }}>{tenant?.l}</div>
                }
                {/* Badge store */}
                <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, background:'rgba(0,0,0,0.6)', border:`1px solid ${storeCol}40`, backdropFilter:'blur(8px)' }}>
                  <span style={{ fontSize:12 }}>{tenant?.appStore==='app_store'?'🍎':tenant?.appStore==='google_play'?'▶':'🌐'}</span>
                  <span style={{ color:storeCol, fontSize:11, fontWeight:700 }}>{tenant?.appStore==='app_store'?'App Store':tenant?.appStore==='google_play'?'Google Play':'Web'}</span>
                </div>
              </div>
            );
          }

          // ⊕ Réseaux : bannière couleur plateforme + grande icône
          if (tenant?.t === 'social') {
            const col = SOCIAL_COLORS_MAP[tenant?.social] || c;
            const ico = SOCIAL_ICONS_MAP[tenant?.social] || '⊕';
            return (
              <div style={{ height: isMobile ? 110 : 140, background:`linear-gradient(135deg, ${col}25 0%, ${col}06 100%)`, display:'flex', alignItems:'center', justifyContent:'center', gap:16, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 35% 50%, ${col}35, transparent 65%)` }} />
                <div style={{ position:'absolute', right:'-10%', top:'-20%', width:'60%', height:'140%', background:`radial-gradient(circle, ${col}12 0%, transparent 65%)`, pointerEvents:'none' }} />
                <span style={{ fontSize:64, position:'relative', filter:`drop-shadow(0 0 20px ${col}80)` }}>{ico}</span>
              </div>
            );
          }

          // ♪ Musique : image album en fond flouté + miniature centrée, puis lecteur audio
          if (tenant?.t === 'music') {
            const col = MUSIC_COLORS_MAP[tenant?.music] || c;
            const icon = MUSIC_ICONS_MAP[tenant?.music] || '🎵';
            if (tenant?.img) return (
              <div style={{ position:'relative', height: isMobile ? 170 : 210, overflow:'hidden', background:U.s2 }}>
                <img src={tenant?.img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.5, filter:'blur(3px)', transform:'scale(1.08)' }} />
                <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${U.s1} 0%, ${col}08 40%, transparent 80%)` }} />
                <img src={tenant?.img} alt="" style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-55%)', width:88, height:88, borderRadius:14, objectFit:'cover', border:`2px solid ${col}70`, boxShadow:`0 12px 40px rgba(0,0,0,0.7), 0 0 24px ${col}40` }} />
                {/* Mini barres égaliseur en bas de l'image */}
                <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'flex-end', gap:3, height:14 }}>
                  {[0.55,1,0.7,0.9,0.45,0.8].map((h,i)=>(
                    <div key={i} style={{ width:3, borderRadius:2, background:col, height:14*h, animation:`eqBar${i%5} ${0.38+i*0.11}s ease-in-out infinite alternate`, boxShadow:`0 0 4px ${col}80` }} />
                  ))}
                </div>
              </div>
            );
            return (
              <div style={{ height: isMobile ? 110 : 130, background:`linear-gradient(135deg, ${col}18, ${U.s2})`, display:'flex', alignItems:'center', justifyContent:'center', gap:18, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 50%, ${col}28, transparent 65%)` }} />
                <span style={{ fontSize:60, position:'relative', filter:`drop-shadow(0 0 20px ${col}80)` }}>{icon}</span>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:28, position:'relative' }}>
                  {[0.55,1,0.7,0.9,0.45,0.8].map((h,i)=>(
                    <div key={i} style={{ width:5, borderRadius:3, background:col, height:28*h, animation:`eqBar${i%5} ${0.38+i*0.11}s ease-in-out infinite alternate`, boxShadow:`0 0 6px ${col}80` }} />
                  ))}
                </div>
              </div>
            );
          }

          // ◎ Vêtements : badge prix en overlay sur la photo
          if (tenant?.img && tenant?.t === 'clothing') return (
            <div style={{ position:'relative', height: isMobile ? 180 : 230, overflow:'hidden', background:U.s2 }}>
              <img src={tenant?.img} alt={tenant?.name} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.85 }} />
              <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${U.s1} 0%, transparent 55%)` }} />
              {tenant?.slogan && (
                <div style={{ position:'absolute', top:14, right:14, padding:'7px 16px', borderRadius:24, background:'rgba(0,0,0,0.82)', color:'#fff', fontSize:14, fontWeight:900, backdropFilter:'blur(10px)', border:'1.5px solid rgba(255,255,255,0.2)', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>{tenant?.slogan}</div>
              )}
            </div>
          );

          // Image / Lifestyle / Marque / Lien avec image
          if (tenant?.img) return (
            <div style={{ position:'relative', height: isMobile ? 170 : 220, overflow:'hidden', background:U.s2 }}>
              <img src={tenant?.img} alt={tenant?.name} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.8 }} />
              <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${U.s1} 0%, ${c}06 40%, transparent 65%)` }} />
              {tenant?.t === 'lifestyle' && tenant?.name && (
                <div style={{ position:'absolute', bottom:16, left:20, right:20, color:'#fff', fontSize:16, fontWeight:700, textShadow:'0 2px 8px rgba(0,0,0,0.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tenant?.name}</div>
              )}
            </div>
          );

          return null;
        })()}

        {occ && tenant ? (
          <div style={{ padding: isMobile ? '16px 20px 28px' : '24px 28px 32px' }}>
            <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: `${TIER_COLOR[tier]}15`, border: `1px solid ${TIER_COLOR[tier]}30`, color: TIER_COLOR[tier], fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 14 }}>{TIER_LABEL[tier]} · €{priceEur(tier)}/j</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, background: tenant?.img ? `url(${tenant?.img}) center/cover` : `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: c, fontFamily: F.h, overflow:'hidden' }}>
                {!tenant?.img && tenant?.l}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  onClick={() => onViewProfile && onViewProfile(tenant?.advertiserId)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left', display:'block' }}
                  title="Voir le profil de l'annonceur"
                >
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                    <div style={{ color: U.text, fontWeight: 700, fontSize: 19, fontFamily: F.h, letterSpacing: '-0.02em' }}>{tenant?.name}</div>
                    <div style={{ color:c, fontSize:11, opacity:0.7, flexShrink:0 }}>↗ profil</div>
                  </div>
                </button>
                <div style={{ color: U.muted, fontSize: 13, lineHeight: 1.5 }}>{tenant?.slogan}</div>
              </div>
            </div>

            {/* Réseaux sociaux / plateforme si renseignés */}
            {(tenant?.social || tenant?.music) && (() => {
              const SOCIAL_META = {
                instagram: { label:'Instagram', icon:'📸', color:'#e1306c', prefix:'https://instagram.com/' },
                tiktok:    { label:'TikTok',    icon:'🎵', color:'#00f2ea', prefix:'https://tiktok.com/@' },
                youtube:   { label:'YouTube',   icon:'▶',  color:'#ff0000', prefix:'https://youtube.com/@' },
                twitter:   { label:'X / Twitter',icon:'✕', color:'#1da1f2', prefix:'https://x.com/' },
                linkedin:  { label:'LinkedIn',  icon:'in', color:'#0077b5', prefix:'https://linkedin.com/in/' },
                facebook:  { label:'Facebook',  icon:'f',  color:'#1877f2', prefix:'https://facebook.com/' },
                snapchat:  { label:'Snapchat',  icon:'👻', color:'#fffc00', prefix:'https://snapchat.com/add/' },
                meta:      { label:'Threads',   icon:'@',  color:'#fff',    prefix:'https://threads.net/@' },
              };
              const MUSIC_META = {
                spotify:    { label:'Spotify',      icon:'♪', color:'#1ed760', prefix:'https://open.spotify.com/' },
                apple:      { label:'Apple Music',  icon:'♫', color:'#fa57c1', prefix:'https://music.apple.com/' },
                soundcloud: { label:'SoundCloud',   icon:'☁', color:'#ff5500', prefix:'https://soundcloud.com/' },
                deezer:     { label:'Deezer',       icon:'≋', color:'#00c7f2', prefix:'https://deezer.com/' },
              };
              const socialMeta = SOCIAL_META[tenant?.social];
              const musicMeta  = MUSIC_META[tenant?.music];
              return (
                <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                  {socialMeta && (
                    <a href={tenant?.url?.includes(socialMeta.prefix?.split('//')[1]?.split('/')[0]) ? tenant?.url : tenant?.url}
                       target="_blank" rel="noopener noreferrer"
                       onClick={e => { e.stopPropagation(); recordClick(slot.x, slot.y, slot.bookingId); }}
                       style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, background:`${socialMeta.color}15`, border:`1px solid ${socialMeta.color}40`, color:socialMeta.color, textDecoration:'none', fontSize:12, fontWeight:700 }}>
                      <span style={{ fontSize:14 }}>{socialMeta.icon}</span> {socialMeta.label}
                    </a>
                  )}
                  {musicMeta && (
                    <a href={tenant?.url} target="_blank" rel="noopener noreferrer"
                       onClick={e => { e.stopPropagation(); recordClick(slot.x, slot.y, slot.bookingId); }}
                       style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, background:`${musicMeta.color}15`, border:`1px solid ${musicMeta.color}40`, color:musicMeta.color, textDecoration:'none', fontSize:12, fontWeight:700 }}>
                      <span style={{ fontSize:14 }}>{musicMeta.icon}</span> {musicMeta.label}
                    </a>
                  )}
                </div>
              );
            })()}

            {/* ── PreviewPlayer 30s — vidéo & musique ── */}
            {(tenant?.t === 'video' || tenant?.t === 'music') && (
              <PreviewPlayer tenant={tenant} isMobile={isMobile} />
            )}

            {/* Badge promo */}
            {tenant?.badge && (
              <div style={{ marginBottom:14, padding:'6px 12px', borderRadius:7, background:`${c}10`, border:`1px solid ${c}20`, display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:c, fontWeight:700 }}>
                ✦ {tenant?.badge}
              </div>
            )}

            {/* Description — histoire ou incitation au clic */}
            {tenant?.description && (
              <div style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 10,
                background: `${c}06`,
                border: `1px solid ${c}14`,
                position: 'relative',
              }}>
                {/* Barre colorée gauche */}
                <div style={{
                  position: 'absolute', left: 0, top: 10, bottom: 10,
                  width: 2, borderRadius: 2,
                  background: `linear-gradient(to bottom, ${c}60, ${c}10)`,
                }} />
                <p style={{
                  margin: 0,
                  paddingLeft: 10,
                  color: 'rgba(255,255,255,0.65)',
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-line',
                }}>
                  {tenant?.description}
                </p>
              </div>
            )}

            {/* Stats publiques — crédibilité et preuve sociale */}
            {publicStats && (publicStats.impressions > 0 || publicStats.clicks > 0) && (
              <div style={{ margin:'16px 0', padding:'12px 14px', borderRadius:10, background:`${c}08`, border:`1px solid ${c}18`, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[
                  [publicStats.impressions_7d?.toLocaleString('fr-FR') ?? '0', 'vues / 7j'],
                  [publicStats.clicks_7d?.toLocaleString('fr-FR')    ?? '0', 'clics / 7j'],
                  [publicStats.ctr_pct != null ? `${publicStats.ctr_pct}%` : '—', 'CTR'],
                ].map(([v, l]) => (
                  <div key={l} style={{ textAlign:'center', padding:'6px 0' }}>
                    <div style={{ color:c, fontWeight:800, fontSize:18, fontFamily:F.h, lineHeight:1 }}>{v}</div>
                    <div style={{ color:'rgba(255,255,255,0.4)', fontSize:9, marginTop:3, fontWeight:600 }}>{l}</div>
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1', borderTop:`1px solid ${c}15`, marginTop:4, paddingTop:8, textAlign:'center' }}>
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', letterSpacing:'0.05em' }}>DONNÉES RÉELLES · MIS À JOUR EN TEMPS RÉEL</span>
                </div>
              </div>
            )}

            <a href={tenant?.url} target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); recordClick(slot.x, slot.y, slot.bookingId); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 20px', borderRadius: 10, background: c, color: U.accentFg, fontWeight: 700, fontSize: 14, fontFamily: F.b, textDecoration: 'none', boxShadow: `0 0 22px ${c}50`, transition: 'opacity 0.15s', marginBottom: 10 }}>
              {tenant?.cta} →
            </a>
            {/* ── Bouton partager ── */}
            <ShareBlocButton x={slot.x} y={slot.y} name={tenant?.name} slogan={tenant?.slogan} />
          </div>
        ) : (() => {
          const isAvail = isTierAvailable(tier);
          const c = TIER_COLOR[tier];
          return (
            <div style={{ padding: isMobile ? '28px 20px 32px' : '40px 28px 40px', textAlign: 'center' }}>
              {/* Icône selon état */}
              <div style={{ width: 64, height: 64, borderRadius: 16, background: isAvail ? `${c}10` : `${c}08`, border: `1.5px solid ${isAvail ? c + '35' : c + '20'}`, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' }}>
                {isAvail ? (
                  // Bloc libre — carré vide avec animation subtle
                  <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${c}50`, background: `${c}10`, animation: 'vacantBreath 2.5s ease-in-out infinite' }} />
                ) : (
                  // Bloc verrouillé — cadenas
                  <span style={{ filter: 'grayscale(0.3)', opacity: 0.7 }}>🔒</span>
                )}
                {isAvail && (
                  <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#00e8a2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✦</div>
                )}
              </div>

              {/* Titre */}
              <div style={{ color: isAvail ? U.text : c, fontWeight: 800, fontSize: 17, fontFamily: F.h, marginBottom: 8, letterSpacing: '-0.01em' }}>
                {isAvail ? 'Bloc disponible' : 'Non disponible'}
              </div>

              {/* Corps */}
              <div style={{ color: U.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                {isAvail ? (
                  <>
                    Ce bloc <strong style={{ color: U.text }}>{TIER_LABEL[tier]}</strong> est libre à la location.<br/>
                    <span style={{ color: U.accent, fontWeight: 600 }}>€{priceEur(tier)}/jour</span> · visibilité immédiate sur la grille.
                  </>
                ) : (
                  <>
                    Les blocs <strong style={{ color: c }}>{TIER_LABEL[tier]}</strong> ne sont pas encore ouverts à la réservation.<br/>
                    Inscrivez-vous pour être <strong style={{ color: U.text }}>notifié en premier</strong> à l'ouverture.
                  </>
                )}
              </div>

              {/* Badge tier */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: `${c}10`, border: `1px solid ${c}25`, marginBottom: 20 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, background: c }} />
                <span style={{ color: c, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{TIER_LABEL[tier]}</span>
                <span style={{ color: U.muted, fontSize: 10 }}>·</span>
                <span style={{ color: U.muted, fontSize: 10 }}>({slot.x}, {slot.y})</span>
              </div>

              {/* CTA */}
              {isAvail ? (
                <button onClick={() => { onClose(); onGoAdvertiser(); }} style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 10, fontFamily: F.b, cursor: 'pointer', background: U.accent, border: 'none', color: U.accentFg, fontWeight: 700, fontSize: 13, boxShadow: `0 0 20px ${U.accent}40` }}>
                  Réserver ce bloc →
                </button>
              ) : (
                <button onClick={() => { onClose(); onWaitlist(); }} style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 10, fontFamily: F.b, cursor: 'pointer', background: `${c}15`, border: `1.5px solid ${c}40`, color: c, fontWeight: 700, fontSize: 13 }}>
                  ✉ Me prévenir à l'ouverture
                </button>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
function LandingGrid({ slots }) {
  const { isMobile } = useScreenSize();
  const canvasRef = useRef(null);
  const frameRef  = useRef(null);
  const startRef  = useRef(0); // ✅ set in useEffect to avoid SSR mismatch

  // ✅ Fix hydration: Math.random() in useMemo causes server/client mismatch.
  // Use useState + useEffect so random selection only runs client-side.
  const [litSlots, setLitSlots] = useState([]);
  useEffect(() => {
    const always = slots.filter(s =>
      (s.tier === 'epicenter') ||
      (s.tier === 'prestige') ||
      (s.occ && s.tier === 'elite')
    );
    const randOcc  = slots.filter(s => s.occ  && s.tier === 'business').sort(() => .5 - Math.random()).slice(0, 12);
    const randVac  = slots.filter(s => !s.occ && s.tier === 'business').sort(() => .5 - Math.random()).slice(0, 8);
    const randVir  = slots.filter(s => s.tier === 'viral').sort(() => .5 - Math.random()).slice(0, 20);
    setLitSlots([...always, ...randOcc, ...randVac, ...randVir]);
  }, [slots.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const BSZ = isMobile ? 7 : 9;   // block size px
    const GAP = isMobile ? 1 : 1.5; // gap px
    const STEP = BSZ + GAP;
    const COLS = GRID_COLS;
    const ROWS = GRID_ROWS;
    const W = COLS * STEP;
    const H = ROWS * STEP;

    // hi-dpi
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    // Build a lookup: slot id → slot
    const slotMap = {};
    slots.forEach(s => { slotMap[`${s.x},${s.y}`] = s; });

    // Phase offset per lit slot (so pulses are staggered)
    const phases = {};
    litSlots.forEach((s, i) => { phases[`${s.x},${s.y}`] = (i / litSlots.length) * Math.PI * 2; });

    function draw(now) {
      const t = (now - startRef.current) / 1000; // seconds
      ctx.clearRect(0, 0, W, H);

      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
          const key = `${x},${y}`;
          const slot = slotMap[key];
          if (!slot) continue;

          const isLit = phases[key] !== undefined;
          const c = TIER_COLOR[slot.tier];

          // base opacity: very dim for all blocks
          let baseAlpha = 0.04;
          if (slot.tier === 'epicenter')                   baseAlpha = 0.22;
          else if (slot.tier === 'prestige' || slot.tier === 'elite') baseAlpha = 0.12;
          else if (slot.tier === 'business') baseAlpha = 0.06;

          let alpha = baseAlpha;
          let glowR = 0;

          if (isLit) {
            const phase  = phases[key];
            const pulse  = 0.5 + 0.5 * Math.sin(t * 0.9 + phase); // 0→1
            const pulse2 = 0.5 + 0.5 * Math.sin(t * 0.4 + phase + 1.2);

            if (slot.tier === 'epicenter') {
              alpha  = 0.55 + 0.35 * pulse;
              glowR  = (BSZ * 3.5 + BSZ * 2 * pulse2);
            } else if (slot.tier === 'prestige' || slot.tier === 'elite') {
              alpha  = 0.28 + 0.22 * pulse;
              glowR  = (BSZ * 1.8 + BSZ * 0.8 * pulse2);
            } else if (slot.tier === 'business') {
              alpha  = 0.12 + 0.14 * pulse;
              glowR  = (BSZ * 1.2 + BSZ * 0.5 * pulse2);
            } else {
              alpha  = 0.06 + 0.07 * pulse;
              glowR  = (BSZ * 0.7 + BSZ * 0.3 * pulse2);
            }
          }

          const px = x * STEP;
          const py = y * STEP;
          const r  = slot.tier === 'epicenter' ? 3 : slot.tier === 'prestige' || slot.tier === 'elite' ? 2 : 1;

          // glow halo
          if (glowR > 0) {
            const grd = ctx.createRadialGradient(px + BSZ/2, py + BSZ/2, 0, px + BSZ/2, py + BSZ/2, glowR);
            grd.addColorStop(0, hexWithAlpha(c, alpha * 0.55));
            grd.addColorStop(1, hexWithAlpha(c, 0));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(px + BSZ/2, py + BSZ/2, glowR, 0, Math.PI * 2);
            ctx.fill();
          }

          // block fill
          ctx.fillStyle = hexWithAlpha(c, alpha);
          roundRect(ctx, px, py, BSZ, BSZ, r);
          ctx.fill();
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [slots, litSlots, isMobile]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: 0.55,
        mixBlendMode: 'screen',
      }}
    />
  );
}

function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Landing Page ──────────────────────────────────────────────
function LandingPage({ slots, onPublic, onWaitlist }) {
  const { isMobile } = useScreenSize();
  const t = useT();
  const lang = useLang();
  const stats = useMemo(() => ({ occupied: slots.filter(s => s.occ).length, vacant: slots.filter(s => !s.occ).length }), [slots]);

  const [platformStats, setPlatformStats] = useState(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`/api/slots?type=platform_stats`)
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows)) return;
        const impressions = rows.filter(r => r.event_type === 'impression').length;
        const clicks      = rows.filter(r => r.event_type === 'click').length;
        setPlatformStats({ impressions, clicks });
      })
      .catch(() => {});
  }, []);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center', padding: isMobile ? '32px 20px 48px' : '48px 40px', position: 'relative', overflowY: 'auto', overflowX: 'hidden', background: U.bg }}>

      {/* Animated mini-grid background */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <LandingGrid slots={slots} />
        {/* Radial vignette — centre transparent, bords opaques */}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 55% 55% at 50% 50%, transparent 0%, ${U.bg}cc 60%, ${U.bg} 100%)` }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, width: '100%', textAlign: 'center', animation: 'fadeUp 0.5s ease forwards' }}>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 20, marginBottom: 28, background: U.s1, border: `1px solid ${U.border2}`, color: U.muted, fontSize: 11 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: U.green, boxShadow: `0 0 6px ${U.green}` }} />
          <span>{stats.vacant} {lang === 'fr' ? 'espaces disponibles' : 'spaces available'} · {t('landing.badge')}</span>
        </div>

        <h1 style={{ color: U.text, fontWeight: 700, fontSize: isMobile ? 36 : 52, lineHeight: 1.05, fontFamily: F.h, letterSpacing: '-0.03em', margin: '0 0 16px' }}>
          {t('landing.title1')}<br />
          <span style={{ color: U.accent }}>{t('landing.title2')}</span>
        </h1>

        <p style={{ color: U.muted, fontSize: isMobile ? 14 : 16, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 36px' }}>
{t('landing.sub')}
        </p>

        {/* Stats live — pertinentes et vraies */}
        <div style={{ display: 'flex', gap: isMobile ? 0 : 1, justifyContent: 'center', marginBottom: 40, flexWrap: 'wrap', background: U.s1, border: `1px solid ${U.border}`, borderRadius: 12, overflow: 'hidden', maxWidth: 520, margin: '0 auto 40px' }}>
          {[
            { v: stats.occupied,                  l: t('landing.stat.active'),  accent: stats.occupied > 0 ? U.accent : U.muted,  live: false },
            { v: stats.vacant,                    l: t('landing.stat.free'),    accent: U.cyan,                                   live: true  },
            { v: '3',                              l: t('landing.stat.tiers'),   accent: U.violet,                                 live: false },
            { v: '1€',                             l: t('landing.stat.from'),    accent: U.green,                                  live: false },
          ].map(({ v, l, accent, live }, i, arr) => (
            <div key={l} style={{
              flex: '1 1 120px', textAlign: 'center',
              padding: isMobile ? '16px 12px' : '20px 16px',
              borderRight: i < arr.length - 1 ? `1px solid ${U.border}` : 'none',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {live && <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}`, flexShrink: 0 }} />}
                <div style={{ color: accent, fontWeight: 800, fontSize: isMobile ? 22 : 28, fontFamily: F.h, letterSpacing: '-0.02em', lineHeight: 1 }}>{v}</div>
              </div>
              <div style={{ color: U.muted, fontSize: 10, marginTop: 5, letterSpacing: '0.04em' }}>{l}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onPublic} style={{ padding: isMobile ? '12px 20px' : '14px 26px', borderRadius: 10, background: U.s1, border: `1px solid ${U.border2}`, cursor: 'pointer', fontFamily: F.b, color: U.text, fontWeight: 600, fontSize: 14, transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = U.s2; e.currentTarget.style.borderColor = U.accent + '60'; }}
            onMouseLeave={e => { e.currentTarget.style.background = U.s1; e.currentTarget.style.borderColor = U.border2; }}>
            {t('landing.cta.explore')}
          </button>
          <button onClick={onWaitlist} style={{ padding: isMobile ? '12px 20px' : '14px 26px', borderRadius: 10, background: U.accent, border: 'none', cursor: 'pointer', fontFamily: F.b, color: U.accentFg, fontWeight: 700, fontSize: 14, boxShadow: `0 0 24px ${U.accent}50, 0 2px 8px rgba(0,0,0,0.4)`, transition: 'box-shadow 0.2s' }}>
            {t('landing.cta.waitlist')}
          </button>
        </div>

        <div style={{ marginTop: 20, color: U.muted, fontSize: 12 }}>{t('landing.tagline')}</div>

        {/* Legal footer links */}
        <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${U.border}`, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['FAQ', '/faq'], ['CGV', '/cgv'], ['Mentions légales', '/legal'], ['Confidentialité', '/privacy']].map(([label, href]) => (
            <a key={href} href={href} style={{ color: U.muted, fontSize: 11, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = U.text}
              onMouseLeave={e => e.currentTarget.style.color = U.muted}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Manifest Modal — CONTRAT GALACTIQUE ──────────────────────
function ManifestModal({ onAccept }) {
  const [phase, setPhase] = useState('contract'); // 'contract' | 'refused' | 'boot'
  const [bootLines, setBootLines] = useState([]);
  const [glitch, setGlitch] = useState(false);
  const t = useT();
  const lang = useLang();

  const triggerGlitch = () => {
    setGlitch(true);
    setTimeout(() => setGlitch(false), 400);
  };

  const handleRefuse = () => {
    triggerGlitch();
    setPhase('refused');
  };

  const handleReset = () => {
    triggerGlitch();
    setPhase('contract');
  };

  const handleAccept = () => {
    triggerGlitch();
    setPhase('boot');
    const lines = lang === 'en' ? [
      '> OATH INITIALIZATION...',
      '> BIOMETRIC VERIFICATION... OK',
      '> GALACTIC SYNC... OK',
      '> CORPORATE ID ASSIGNMENT... OK',
      '> EPICENTER ACCESS... UNLOCKED',
      '> LEVEL 1 AVAILABLE — €1 / 7 DAYS',
      '> WELCOME TO THE CORPORATION.',
      '█ LOADING...',
    ] : [
      '> INITIALISATION DU SERMENT...',
      '> VÉRIFICATION BIOMÉTRIQUE... OK',
      '> SYNCHRONISATION GALACTIQUE... OK',
      '> ASSIGNATION D\'IDENTIFIANT CORPORATIF... OK',
      '> ACCÈS À L\'ÉPICENTRE... DÉVERROUILLÉ',
      '> NIVEAU 1 DISPONIBLE — 1€ / 7 JOURS',
      '> BIENVENUE DANS LA CORPORATION.',
      '█ CHARGEMENT EN COURS...',
    ];
    lines.forEach((line, i) => {
      setTimeout(() => {
        setBootLines(prev => [...prev, line]);
        if (i === lines.length - 1) {
          setTimeout(onAccept, 900);
        }
      }, i * 320);
    });
  };

  const scanlineStyle = {
    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
    background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,200,240,0.025) 2px,rgba(0,200,240,0.025) 3px)',
  };
  const cornerStyle = (pos) => {
    const s = { position: 'absolute', width: 18, height: 18, zIndex: 2 };
    if (pos === 'tl') { s.top = 12; s.left = 12; s.borderTop = `1.5px solid ${U.cyan}`; s.borderLeft = `1.5px solid ${U.cyan}`; }
    if (pos === 'tr') { s.top = 12; s.right = 12; s.borderTop = `1.5px solid ${U.cyan}`; s.borderRight = `1.5px solid ${U.cyan}`; }
    if (pos === 'bl') { s.bottom = 12; s.left = 12; s.borderBottom = `1.5px solid ${U.cyan}`; s.borderLeft = `1.5px solid ${U.cyan}`; }
    if (pos === 'br') { s.bottom = 12; s.right = 12; s.borderBottom = `1.5px solid ${U.cyan}`; s.borderRight = `1.5px solid ${U.cyan}`; }
    return s;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,2,10,0.97)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: F.mono,
      animation: glitch ? 'glitchScreen 0.4s ease' : 'none',
    }}>
      <style>{`
        @keyframes glitchScreen {
          0%   { filter: brightness(1); }
          10%  { filter: brightness(3) saturate(0) hue-rotate(90deg); transform: translateX(4px); }
          20%  { filter: brightness(0.2); transform: translateX(-3px) skewX(2deg); }
          40%  { filter: brightness(2) hue-rotate(180deg); transform: translateX(2px); }
          60%  { filter: brightness(1.5) saturate(2); transform: translateX(0); }
          80%  { filter: brightness(0.8) hue-rotate(-30deg); }
          100% { filter: brightness(1); transform: none; }
        }
        @keyframes manifestBlink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes scanDown {
          0% { top: 0; } 100% { top: 100%; }
        }
        @keyframes pulseRed {
          0%, 100% { box-shadow: 0 0 20px rgba(208,40,72,0.4); }
          50% { box-shadow: 0 0 40px rgba(208,40,72,0.9), 0 0 80px rgba(208,40,72,0.3); }
        }
        @keyframes pulseCyan {
          0%, 100% { box-shadow: 0 0 20px rgba(0,200,240,0.3); }
          50% { box-shadow: 0 0 40px rgba(0,200,240,0.8), 0 0 80px rgba(0,200,240,0.2); }
        }
        @keyframes bootCursor {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes manifestFlicker {
          0%, 92%, 96%, 100% { opacity: 1; }
          93% { opacity: 0.4; }
          95% { opacity: 0.7; }
          97% { opacity: 0.3; }
        }
      `}</style>

      {/* Scan line animation */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          background: 'rgba(0,200,240,0.08)',
          animation: 'scanDown 4s linear infinite',
        }} />
      </div>

      {/* Main panel */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 680,
        margin: '0 16px',
        background: 'rgba(0,3,16,0.98)',
        border: `1px solid ${phase === 'refused' ? U.rose : U.cyan}44`,
        clipPath: 'polygon(0 0,calc(100% - 24px) 0,100% 24px,100% 100%,24px 100%,0 calc(100% - 24px))',
        animation: `manifestFlicker 6s infinite, ${phase === 'refused' ? 'pulseRed' : 'pulseCyan'} 3s ease-in-out infinite`,
        overflow: 'hidden',
      }}>
        <div style={scanlineStyle} />
        <div style={cornerStyle('tl')} />
        <div style={cornerStyle('tr')} />
        <div style={cornerStyle('bl')} />
        <div style={cornerStyle('br')} />

        {/* Header bar */}
        <div style={{
          padding: '10px 20px',
          background: phase === 'refused'
            ? 'rgba(208,40,72,0.12)'
            : 'rgba(0,200,240,0.06)',
          borderBottom: `1px solid ${phase === 'refused' ? U.rose : U.cyan}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ color: U.muted, fontSize: 10, letterSpacing: '.2em', flexShrink: 0 }}>
            {phase === 'refused' ? 'CORP://SYS/SECURITY/REVOKE' : 'CORP://SYS/ENROLLMENT/PROTOCOL-7'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* ── Lang toggle inside manifest ── */}
            <LangToggleInline />
            <span style={{
              color: phase === 'refused' ? U.rose : U.cyan,
              fontSize: 10, letterSpacing: '.2em',
              animation: 'manifestBlink 1.2s step-end infinite',
              whiteSpace: 'nowrap',
            }}>
              {phase === 'refused' ? t('manifest.refused.status') : phase === 'boot' ? '◈ INIT' : t('manifest.waiting')}
            </span>
          </div>
        </div>

        <div style={{ padding: '28px 32px 32px', position: 'relative', zIndex: 2 }}>

          {/* ── PHASE: BOOT ── */}
          {phase === 'boot' && (
            <div>
              <div style={{ color: U.cyan, fontSize: 13, letterSpacing: '.15em', marginBottom: 20 }}>
                {t('manifest.boot.title')}
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 12, color: U.green, lineHeight: 2 }}>
                {bootLines.map((line, i) => (
                  <div key={i} style={{ opacity: 1 }}>{line}</div>
                ))}
                <span style={{ animation: 'bootCursor 0.8s step-end infinite', color: U.cyan }}>█</span>
              </div>
            </div>
          )}

          {/* ── PHASE: REFUSED ── */}
          {phase === 'refused' && (
            <div>
              <div style={{ color: U.rose, fontSize: 16, fontWeight: 700, letterSpacing: '.2em', marginBottom: 6 }}>
                {t('manifest.refused.title')}
              </div>
              <div style={{ color: U.rose, fontSize: 11, letterSpacing: '.15em', marginBottom: 24, opacity: 0.7 }}>
                {t('manifest.refused.sub')}
              </div>
              <div style={{
                padding: '14px 16px', marginBottom: 20,
                background: 'rgba(208,40,72,0.06)',
                border: `1px solid ${U.rose}33`,
                color: U.text, fontSize: 12.5, lineHeight: 1.9,
              }}>
                {t('manifest.refused.body').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
              </div>

              <div style={{ color: U.accent, fontSize: 11, letterSpacing: '.18em', marginBottom: 12 }}>
                {t('manifest.refused.conseq')}
              </div>
              {(lang === 'en' ? [
                ['DENIAL OF EXISTENCE', 'Without a slot, you are nothing but space debris. Your IP address has been marked as "Unstable".'],
                ['VISUAL QUARANTINE', 'Access to the Epicenter and Level 1 is now forbidden. You will see only the void.'],
                ['FORCED EXTRACTION', 'Your browsing data was collected anyway as compensation for wasted processor time. It is already on its way to the Corporation\'s servers.'],
              ] : [
                ['DÉNI D\'EXISTENCE', 'Sans slot, vous n\'êtes qu\'un débris spatial. Votre adresse IP a été marquée comme "Instable".'],
                ['QUARANTAINE VISUELLE', 'L\'accès à l\'Épicentre et au Niveau 1 vous est désormais interdit. Vous ne verrez que le vide.'],
                ['PRÉLÈVEMENT FORCÉ', 'Vos données de navigation ont tout de même été collectées à titre de compensation pour le temps processeur gaspillé. Elles sont déjà en route vers les serveurs de la Corporation.'],
              ]).map(([title, desc]) => (
                <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 12, paddingLeft: 8 }}>
                  <span style={{ color: U.rose, fontSize: 14, flexShrink: 0, marginTop: 1 }}>▸</span>
                  <div>
                    <span style={{ color: U.rose, fontSize: 11, letterSpacing: '.12em', fontWeight: 700 }}>{title}</span>
                    <span style={{ color: U.muted, fontSize: 11 }}> : {desc}</span>
                  </div>
                </div>
              ))}

              <div style={{
                marginTop: 20, marginBottom: 24, padding: '12px 16px',
                background: 'rgba(232,160,32,0.06)', border: `1px solid ${U.accent}33`,
                fontSize: 11.5, color: U.text, lineHeight: 1.8,
              }}>
                <span style={{ color: U.accent, letterSpacing: '.12em' }}>{t('manifest.refused.reco')} </span>
                {t('manifest.refused.reco.body')}
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={handleReset} style={{
                  flex: 1, minWidth: 200, padding: '13px 16px',
                  background: `${U.accent}18`, border: `1px solid ${U.accent}66`,
                  clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
                  color: U.accent, fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer',
                  boxShadow: `0 0 20px ${U.accent}30`, transition: 'all .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${U.accent}30`; e.currentTarget.style.boxShadow = `0 0 32px ${U.accent}60`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${U.accent}18`; e.currentTarget.style.boxShadow = `0 0 20px ${U.accent}30`; }}>
                  {t('manifest.refused.reset')}
                </button>
                <button onClick={() => {}} style={{
                  padding: '13px 16px',
                  background: 'transparent', border: `1px solid ${U.border}`,
                  clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)',
                  color: U.muted, fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'not-allowed',
                  opacity: 0.5,
                }}>
                  {t('manifest.refused.quit')}
                </button>
              </div>
              <div style={{ marginTop: 10, color: U.muted, fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>
                {t('manifest.refused.quit.note')}
              </div>
            </div>
          )}

          {/* ── PHASE: CONTRACT ── */}
          {phase === 'contract' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, flexShrink: 0,
                  clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
                  background: `${U.accent}22`, border: `1px solid ${U.accent}88`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: U.accent,
                }}>⬡</div>
                <div>
                  <div style={{ color: U.accent, fontSize: 14, fontWeight: 700, letterSpacing: '.18em' }}>
                    {t('manifest.title')}
                  </div>
                  <div style={{ color: U.muted, fontSize: 10, letterSpacing: '.12em', marginTop: 2 }}>
                    {t('manifest.subtitle')}
                  </div>
                </div>
              </div>

              {/* Separator */}
              <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${U.cyan}44,transparent)`, marginBottom: 20 }} />

              {/* Scroll area */}
              <div style={{
                maxHeight: 280, overflowY: 'auto', marginBottom: 22,
                paddingRight: 8,
                scrollbarWidth: 'thin',
                scrollbarColor: `${U.cyan}33 transparent`,
              }}>
                {(lang === 'en' ? [
                  { art: 'ART. I — IDENTITY',    text: 'By accessing the Grid, you acknowledge your existence as a registered corporate entity. Any attempt at anonymity will be interpreted as a hostile act against the Corporation.' },
                  { art: 'ART. II — THE SLOTS',   text: 'Slots are the fundamental unit of presence in the Epicenter. Without an active slot, your signal is undetected. Level 1 is accessible from €1 — it is your only gateway into the visible dimension.' },
                  { art: 'ART. III — THE LEVY',   text: 'By signing this contract, you authorize the Corporation to collect your browsing data, click patterns, and temporal footprint. These data feed the Dyson Sphere and cannot be revoked.' },
                  { art: 'ART. IV — THE STAR',    text: 'The Epicenter is occupied by the Star — the most visible entity in the Grid. The Star does not negotiate. It radiates. Your mission is to orbit its signal, not contest it.' },
                  { art: 'ART. V — NON-TERMINATION', text: 'This contract cannot be terminated, cancelled, or contested before any terrestrial or extraterrestrial court. The Corporation operates outside jurisdiction. The only recourse is total acceptance.' },
                  { art: 'ART. VI — CONSEQUENCES', text: 'Any refusal to sign triggers immediate activation of the Darkness Protocol: visual isolation, access revocation, and IP marking as a non-compliant entity in the galactic registers.' },
                ] : [
                  { art: 'ART. I — IDENTITÉ',     text: 'En accédant à la Grille, vous reconnaissez votre existence en tant qu\'entité corporative enregistrée. Toute tentative d\'anonymat sera interprétée comme un acte hostile envers la Corporation.' },
                  { art: 'ART. II — LES SLOTS',   text: 'Les slots constituent l\'unité fondamentale de présence dans l\'Épicentre. Sans slot actif, votre signal n\'est pas détecté. Le Niveau 1 est accessible dès 1€ — c\'est votre seule porte d\'entrée dans la dimension visible.' },
                  { art: 'ART. III — LE PRÉLÈVEMENT', text: 'En signant ce contrat, vous autorisez la Corporation à collecter vos données de navigation, patterns de clic, et empreinte temporelle. Ces données alimentent la Sphère Dyson et ne peuvent être révoquées.' },
                  { art: 'ART. IV — L\'ÉTOILE',   text: 'L\'Épicentre est occupé par l\'Étoile — l\'entité la plus visible de la Grille. L\'Étoile ne négocie pas. Elle rayonne. Votre mission est d\'orbiter autour de son signal, pas de le contester.' },
                  { art: 'ART. V — NON-RÉSILIATION', text: 'Ce contrat ne peut être résilié, annulé, ou contesté devant aucun tribunal terrestre ou extraterrestre. La Corporation opère hors juridiction. Le seul recours est l\'acceptation totale.' },
                  { art: 'ART. VI — CONSÉQUENCES', text: 'Tout refus de signer entraîne l\'activation immédiate du Protocole Obscurité : isolation visuelle, révocation d\'accès, et marquage IP comme entité non-conforme dans les registres galactiques.' },
                ]).map(({ art, text }) => (
                  <div key={art} style={{ marginBottom: 16 }}>
                    <div style={{ color: U.cyan, fontSize: 10, letterSpacing: '.18em', marginBottom: 5, fontWeight: 700 }}>{art}</div>
                    <div style={{ color: U.muted, fontSize: 12, lineHeight: 1.8, paddingLeft: 12, borderLeft: `2px solid ${U.cyan}22` }}>{text}</div>
                  </div>
                ))}

                <div style={{
                  marginTop: 16, padding: '12px 14px',
                  background: `${U.accent}08`, border: `1px solid ${U.accent}33`,
                  color: U.accent, fontSize: 11, lineHeight: 1.7, letterSpacing: '.04em',
                }}>
                  {lang === 'en'
                    ? '⚠ BY SIGNING THIS CONTRACT, YOU ACCEPT ALL CLAUSES ABOVE AND ACKNOWLEDGE THAT THE CORPORATION IS THE SOLE COMPETENT AUTHORITY REGARDING SLOTS, VISIBILITY, AND DIGITAL EXISTENCE.'
                    : '⚠ EN SIGNANT CE CONTRAT, VOUS ACCEPTEZ L\'INTÉGRALITÉ DES CLAUSES CI-DESSUS ET RECONNAISSEZ QUE LA CORPORATION EST L\'UNIQUE AUTORITÉ COMPÉTENTE EN MATIÈRE DE SLOTS, DE VISIBILITÉ ET D\'EXISTENCE DIGITALE.'}
                </div>
              </div>

              {/* Separator */}
              <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${U.cyan}44,transparent)`, marginBottom: 20 }} />

              {/* CTA buttons */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={handleAccept} style={{
                  flex: 1, minWidth: 200, padding: '14px 16px',
                  background: `${U.accent}1A`, border: `1px solid ${U.accent}`,
                  clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
                  color: U.accent, fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer',
                  boxShadow: `0 0 24px ${U.accent}44, inset 0 0 20px ${U.accent}08`,
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${U.accent}30`; e.currentTarget.style.boxShadow = `0 0 40px ${U.accent}70, inset 0 0 30px ${U.accent}15`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${U.accent}1A`; e.currentTarget.style.boxShadow = `0 0 24px ${U.accent}44, inset 0 0 20px ${U.accent}08`; }}>
                  {t('manifest.cta.sign')}
                </button>
                <button onClick={handleRefuse} style={{
                  padding: '14px 18px',
                  background: 'transparent', border: `1px solid ${U.border}`,
                  clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)',
                  color: U.muted, fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer',
                  transition: 'all .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = U.rose + '66'; e.currentTarget.style.color = U.rose; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = U.border; e.currentTarget.style.color = U.muted; }}>
                  {t('manifest.cta.refuse')}
                </button>
              </div>

              <div style={{ marginTop: 14, color: U.muted, fontSize: 10, opacity: 0.6, lineHeight: 1.6 }}>
                {t('manifest.footer')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────
const CommunityChat = dynamic(() => import('./CommunityChat'), { ssr: false, loading: () => null });

export default function App() {
  const [lang, setLang]             = useState('fr');
  const [view, setView]             = useState('landing');
  const [manifestAccepted, setManifestAccepted] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [checkoutSlot, setCheckoutSlot] = useState(null);
  const [buyoutSlot, setBuyoutSlot]     = useState(null);
  const [showBoost, setShowBoost]       = useState(false);
  const [adViewSlot, setAdViewSlot]     = useState(null);
  const [advProfileId, setAdvProfileId] = useState(null); // profil annonceur
  const [authUser, setAuthUser]         = useState(null);
  const { slots, isLive, loading }  = useGridData();
  const { isMobile } = useScreenSize();
  const handleWaitlist = useCallback(() => setShowWaitlist(true), []);

  // ── Check if manifest was already accepted ──
  useEffect(() => {
    try {
      if (localStorage.getItem('corp_contract_signed')) setManifestAccepted(true);
    } catch {}
  }, []);

  const handleManifestAccept = useCallback(() => {
    try { localStorage.setItem('corp_contract_signed', '1'); } catch {}
    setManifestAccepted(true);
  }, []);

  // ── Restore language from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ads_lang');
      if (saved === 'en' || saved === 'fr') setLang(saved);
    } catch {}
  }, []);

  const handleSetLang = useCallback((fn) => {
    setLang(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      try { localStorage.setItem('ads_lang', next); } catch {}
      return next;
    });
  }, []);

  // ── Auth session ──
  useEffect(() => {
    getSession().then(s => {
      setAuthUser(s?.user || null);
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setAuthUser(null);
  }, []);

  const handleCheckout = useCallback(slot => {
    if (slot?.occ) {
      setBuyoutSlot(slot);
      return;
    }
    if (slot) {
      setCheckoutSlot(slot);
    } else {
      setShowWaitlist(true);
    }
  }, []);

  const t = getT(lang);

  const navBtn = (key, label, icon) => (
    <button key={key} onClick={() => setView(key)} style={{
      padding: isMobile ? '5px 9px' : '5px 14px',
      background: view === key ? `${U.cyan}14` : 'transparent',
      border: `0.5px solid ${view === key ? U.cyan : U.border}`,
      clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%)',
      color: view === key ? U.cyan : U.muted,
      fontFamily: F.mono, fontSize: isMobile ? 10 : 10.5,
      fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
      cursor: 'pointer', outline: 'none',
      boxShadow: view === key ? `0 0 14px ${U.cyan}22` : 'none',
      transition: 'all 0.12s', whiteSpace: 'nowrap',
      display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 5,
    }}>
      <span>{icon}</span>{!isMobile && <span>{label}</span>}
    </button>
  );

  return (
    <LangContext.Provider value={lang}>
    <LangSetterContext.Provider value={handleSetLang}>
      {!manifestAccepted && <ManifestModal onAccept={handleManifestAccept} />}
      <div style={{ display: 'flex', height: '100vh', background: '#01020A', fontFamily: F.b, color: U.text, flexDirection: 'column', overflow: view === 'landing' ? 'auto' : 'hidden' }}>
        <AnnouncementBar onWaitlist={handleWaitlist} />

        {/* ── Header ── */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 20px', height: 50, flexShrink: 0,
          borderBottom: `0.5px solid ${U.border}`,
          background: 'rgba(0,3,14,0.98)',
          backdropFilter: 'blur(24px) saturate(200%)',
          zIndex: 100, gap: 8,
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,200,240,0.015) 2px,rgba(0,200,240,0.015) 3px)',
          boxShadow: '0 1px 0 rgba(0,200,240,0.08), 0 2px 20px rgba(0,0,0,0.8)',
        }}>
          <BrandLogo size={isMobile ? 14 : 15} onClick={() => setView('landing')} />

          <nav style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {navBtn('cosmos',    t('nav.explore'), '◈')}
            {navBtn('community','COMMUNITY',       '◎')}

            {/* Waitlist CTA */}
            <button onClick={handleWaitlist} style={{
              padding: isMobile ? '5px 10px' : '6px 16px',
              background: `${U.accent}18`,
              border: `0.5px solid ${U.accent}55`,
              clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))',
              color: U.accent, fontFamily: F.mono,
              fontSize: isMobile ? 9 : 10, fontWeight: 700,
              letterSpacing: '.12em', textTransform: 'uppercase',
              marginLeft: 4, cursor: 'pointer', outline: 'none',
              boxShadow: `0 0 16px ${U.accent}30`, whiteSpace: 'nowrap',
              transition: 'all .12s',
            }}>
              {isMobile ? t('nav.waitlist.short') : t('nav.waitlist')}
            </button>

            {/* Auth */}
            {authUser ? (
              <>
                <a href="/dashboard" title="Dashboard" style={{
                  width: 30, height: 30,
                  clipPath: 'polygon(15% 0,85% 0,100% 15%,100% 85%,85% 100%,15% 100%,0 85%,0 15%)',
                  background: `${U.accent}14`, border: `1px solid ${U.accent}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', flexShrink: 0, cursor: 'pointer',
                }}><span style={{ fontSize: 13 }}>👤</span></a>
                {!isMobile && (
                  <button onClick={handleSignOut} title="Se déconnecter" style={{
                    width: 30, height: 30,
                    clipPath: 'polygon(15% 0,85% 0,100% 15%,100% 85%,85% 100%,15% 100%,0 85%,0 15%)',
                    background: 'transparent', border: `0.5px solid ${U.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, color: U.muted,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = U.rose; e.currentTarget.style.color = U.rose; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = U.border; e.currentTarget.style.color = U.muted; }}>
                    <span style={{ fontSize: 12 }}>⏻</span>
                  </button>
                )}
              </>
            ) : (
              <a href="/dashboard/login" title="Se connecter" style={{
                width: 30, height: 30,
                clipPath: 'polygon(15% 0,85% 0,100% 15%,100% 85%,85% 100%,15% 100%,0 85%,0 15%)',
                background: 'transparent', border: `0.5px solid ${U.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', flexShrink: 0, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = U.border2; e.currentTarget.style.background = `${U.cyan}08`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = U.border; e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 13 }}>🔑</span>
              </a>
            )}

            {/* Lang */}
            <button onClick={() => handleSetLang(l => l === 'fr' ? 'en' : 'fr')} style={{
              marginLeft: isMobile ? 1 : 3, padding: isMobile ? '4px 7px' : '4px 10px',
              clipPath: 'polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,0 100%)',
              background: 'transparent', border: `0.5px solid ${U.border}`,
              color: U.muted, fontFamily: F.mono, fontSize: isMobile ? 9 : 10,
              fontWeight: 700, letterSpacing: '.14em', cursor: 'pointer', outline: 'none',
              transition: 'all 0.12s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = U.text; e.currentTarget.style.borderColor = U.border2; }}
            onMouseLeave={e => { e.currentTarget.style.color = U.muted; e.currentTarget.style.borderColor = U.border; }}>
              {lang === 'fr' ? 'EN' : 'FR'}
            </button>
          </nav>
        </header>

        {/* ── Vue Landing ── */}
        {view === 'landing' && (
          <LandingPage
            slots={slots}
            onPublic={() => setView('cosmos')}
            onWaitlist={handleWaitlist}
          />
        )}

        {/* ── Vue Cosmos 3D — toujours montée pour garder la scène en mémoire ── */}
        <div style={{ flex: 1, display: view === 'cosmos' ? 'flex' : 'none', overflow: 'hidden' }}>
          <View3D
            slots={slots} isLive={isLive} user={authUser}
            onCheckout={handleCheckout} onBuyout={setBuyoutSlot}
            onViewSlot={(slot) => setAdViewSlot(slot)}
          />
        </div>

        {/* ── Vue Community Chat ── */}
        {view === 'community' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CommunityChat user={authUser} />
          </div>
        )}

        {/* ── Modals ── */}
        {showWaitlist  && <WaitlistModal  onClose={() => setShowWaitlist(false)} />}
        {checkoutSlot  && <CheckoutModal  slot={checkoutSlot} onClose={() => setCheckoutSlot(null)} />}
        {buyoutSlot    && <BuyoutModal    slot={buyoutSlot}   onClose={() => setBuyoutSlot(null)} />}
        {showBoost     && <BoostModal     onClose={() => setShowBoost(false)} />}
        {adViewSlot && (
          <AdViewModal
            slot={adViewSlot} allSlots={slots}
            onClose={() => setAdViewSlot(null)}
            onNavigate={(slot) => setAdViewSlot(slot)}
            onViewProfile={(advId) => { setAdViewSlot(null); if(advId) setAdvProfileId(advId); }}
            onGoAdvertiser={() => setAdViewSlot(null)}
          />
        )}
        {advProfileId && (
          <AdvertiserProfileModal
            advertiserId={advProfileId} slots={slots}
            onClose={() => setAdvProfileId(null)}
            onOpenSlot={(slot) => { setAdvProfileId(null); setAdViewSlot(slot); }}
          />
        )}
      </div>
    </LangSetterContext.Provider>
    </LangContext.Provider>
  );
}
