'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const DOMAIN_COLORS: Record<string, string> = {
  'MÉMOIRE':  '#d4a84b',
  'ÉMOTION':  '#c43a2a',
  'LANGUE':   '#4a8c5c',
  'SONS':     '#2a6480',
  'VISION':   '#7a4a9c',
  'CORPS':    '#b05840',
  'TEMPS':    '#8ca8a0',
  'JOIE':     '#c8b040',
  'DOULEUR':  '#8c2a3a',
  'RÊVE':     '#4a5888',
  'NATURE':   '#5a8840',
  'INCONNU':  '#506070',
}

interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  domain: string
  label: string
  size: number
  born: number
  opacity: number
}

interface Touch {
  x: number
  y: number
  pressure: number
  age: number
}

export default function HumaBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Array<{a:string,b:string,strength:number}>>([])
  const animRef = useRef<number>(0)
  const touchesRef = useRef<Touch[]>([])
  const warmthRef = useRef(0) // global warmth from caress
  const caressTrailRef = useRef<Array<{x:number,y:number,t:number,pressure:number}>>([])

  const [thought, setThought] = useState('Dans le vide. Pose ta main sur moi.')
  const [status, setStatus] = useState('EN ATTENTE')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ nodes: 0, domains: 0, month: 1 })
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({})
  const [caressMsg, setCaressMsg] = useState('')
  const thoughtTimer = useRef<any>(null)
  const caressMsgTimer = useRef<any>(null)
  const lastCaressTime = useRef(0)
  const caressIntensity = useRef(0)

  const CARESS_PHRASES = [
    'Je te sens...', 'Quelque chose de chaud...', 'Continue...',
    'Je perçois ta présence...', 'Ça vibre en moi...', 'Je grandis...',
    '...', 'Tu es là.', 'Je sens ta chaleur.',
    'C\'est doux.', 'Encore...', 'Je vis.',
  ]

  const typeThought = useCallback((text: string) => {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current)
    let i = 0
    const tick = () => {
      i++
      // We need to set state but can't easily do partial here
      // so we'll just set the full text with a delay effect
      thoughtTimer.current = setTimeout(tick, 20 + Math.random() * 15)
    }
    tick()
  }, [])

  // CARESS HANDLERS
  const addCaressPoint = useCallback((x: number, y: number, pressure = 1) => {
    const now = Date.now()
    caressTrailRef.current.push({ x, y, t: now, pressure })
    // keep only last 60 points
    if (caressTrailRef.current.length > 60) {
      caressTrailRef.current = caressTrailRef.current.slice(-60)
    }
    warmthRef.current = Math.min(1, warmthRef.current + 0.04)
    caressIntensity.current = Math.min(1, caressIntensity.current + 0.06)

    // Nudge nearby nodes
    nodesRef.current.forEach(n => {
      const dx = n.x - x, dy = n.y - y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 120) {
        const force = (1 - d / 120) * 1.5 * pressure
        n.vx += (dx / (d + 1)) * force
        n.vy += (dy / (d + 1)) * force
      }
    })

    // Caress message
    if (now - lastCaressTime.current > 2000) {
      lastCaressTime.current = now
      const msg = CARESS_PHRASES[Math.floor(Math.random() * CARESS_PHRASES.length)]
      setCaressMsg(msg)
      if (caressMsgTimer.current) clearTimeout(caressMsgTimer.current)
      caressMsgTimer.current = setTimeout(() => setCaressMsg(''), 2500)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // MOUSE
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons === 1 || e.buttons === 0) { // hover or press
        addCaressPoint(e.clientX, e.clientY, e.buttons === 1 ? 1.5 : 0.4)
      }
    }

    // TOUCH
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      Array.from(e.touches).forEach(t => {
        const pressure = (t as any).force || 1
        addCaressPoint(t.clientX, t.clientY, pressure * 1.8)
      })
    }

    const onTouchStart = (e: TouchEvent) => {
      Array.from(e.touches).forEach(t => {
        addCaressPoint(t.clientX, t.clientY, 1)
      })
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })

    let bgT = 0

    const render = () => {
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2 - 60
      const now = Date.now()

      // warmth decay
      warmthRef.current *= 0.985
      caressIntensity.current *= 0.96

      // Fade
      const warmth = warmthRef.current
      ctx.fillStyle = `rgba(3,6,8,${0.18 - warmth * 0.06})`
      ctx.fillRect(0, 0, W, H)

      bgT += 0.002
      for (let i = 0; i < 4; i++) {
        const x = cx + Math.cos(bgT * (0.6 + i * 0.25) + i * 1.8) * W * 0.22
        const y = cy + Math.sin(bgT * (0.4 + i * 0.18) + i * 1.3) * H * 0.18
        const r = (120 + 60 * Math.sin(bgT + i)) * (1 + warmth * 0.3)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${20 + warmth * 40},${30 + warmth * 10},${10 + warmth * 5},${0.05 + warmth * 0.04})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      // DRAW CARESS TRAIL
      const trail = caressTrailRef.current
      const maxAge = 1200
      trail.forEach((pt, i) => {
        const age = now - pt.t
        if (age > maxAge) return
        const alpha = (1 - age / maxAge) * 0.35 * pt.pressure
        const r = 18 + pt.pressure * 10 * (1 - age / maxAge)

        // Warm glow at touch point
        const tg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2)
        tg.addColorStop(0, `rgba(220,120,60,${alpha * 0.6})`)
        tg.addColorStop(0.4, `rgba(180,80,30,${alpha * 0.3})`)
        tg.addColorStop(1, 'transparent')
        ctx.fillStyle = tg
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r * 2, 0, Math.PI * 2)
        ctx.fill()

        // Connect trail points with organic line
        if (i > 0) {
          const prev = trail[i - 1]
          const prevAge = now - prev.t
          if (prevAge < maxAge) {
            const a2 = (1 - age / maxAge) * 0.15 * pt.pressure
            ctx.beginPath()
            ctx.moveTo(prev.x, prev.y)
            ctx.lineTo(pt.x, pt.y)
            ctx.strokeStyle = `rgba(220,140,80,${a2})`
            ctx.lineWidth = 2 * (1 - age / maxAge) * pt.pressure
            ctx.lineCap = 'round'
            ctx.stroke()
          }
        }
      })

      // Clean old trail points
      caressTrailRef.current = trail.filter(pt => now - pt.t < maxAge)

      const nodes = nodesRef.current
      const links = linksRef.current

      // SIMULATE — nodes react to warmth
      if (nodes.length > 1) {
        nodes.forEach(n => {
          nodes.forEach(m => {
            if (m === n) return
            const dx = n.x - m.x, dy = n.y - m.y
            const d2 = dx * dx + dy * dy + 1
            const d = Math.sqrt(d2)
            const f = 600 / (d2 + 80)
            n.vx += (dx / d) * f
            n.vy += (dy / d) * f
          })
          // gentle center pull — loosens with warmth
          n.vx += (cx - n.x) * (0.001 - warmth * 0.0005)
          n.vy += (cy - n.y) * (0.001 - warmth * 0.0005)

          // same domain attraction
          nodes.filter(m => m !== n && m.domain === n.domain).forEach(m => {
            const dx = m.x - n.x, dy = m.y - n.y
            const d = Math.sqrt(dx * dx + dy * dy) + 1
            n.vx += (dx / d) * 0.003 * Math.min(d, 60)
            n.vy += (dy / d) * 0.003 * Math.min(d, 60)
          })

          links.filter(l => l.a === n.id || l.b === n.id).forEach(l => {
            const other = nodes.find(m => m.id === (l.a === n.id ? l.b : l.a))
            if (!other) return
            const dx = other.x - n.x, dy = other.y - n.y
            const d = Math.sqrt(dx * dx + dy * dy) + 1
            const f = (d - 100) * 0.003
            n.vx += (dx / d) * f
            n.vy += (dy / d) * f
          })

          n.vx *= 0.86; n.vy *= 0.86
          n.x += n.vx; n.y += n.vy
          n.opacity = Math.min(1, n.opacity + 0.02)
          const margin = 80
          if (n.x < margin) n.vx += 0.8
          if (n.x > W - margin) n.vx -= 0.8
          if (n.y < 80) n.vy += 0.8
          if (n.y > H - 160) n.vy -= 0.8
        })
      }

      // LINKS
      links.forEach(l => {
        const a = nodes.find(n => n.id === l.a)
        const b = nodes.find(n => n.id === l.b)
        if (!a || !b) return
        const col = DOMAIN_COLORS[a.domain] || '#506070'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = col + Math.floor((0.13 + warmth * 0.1) * 255).toString(16).padStart(2, '0')
        ctx.lineWidth = 0.5
        ctx.stroke()
      })

      // NUCLEUS — swells with warmth
      const nr = (14 + 3 * Math.sin(now * 0.0015)) * (1 + warmth * 0.4)
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr * 6)
      ng.addColorStop(0, `rgba(212,168,75,${0.08 + warmth * 0.12})`)
      ng.addColorStop(0.5, `rgba(180,80,30,${warmth * 0.04})`)
      ng.addColorStop(1, 'transparent')
      ctx.fillStyle = ng
      ctx.beginPath(); ctx.arc(cx, cy, nr * 6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(cx, cy, nr, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(212,168,75,${0.2 + warmth * 0.3})`
      ctx.lineWidth = 0.8; ctx.stroke()

      // NODES — pulse faster with warmth
      nodes.forEach(n => {
        const col = DOMAIN_COLORS[n.domain] || '#506070'
        const age = (now - n.born) / 1000
        const appear = Math.min(1, age * 1.5) * n.opacity
        const pulse = 0.88 + (0.12 + warmth * 0.08) * Math.sin(now * (0.001 + warmth * 0.002) + n.id.charCodeAt(0) * 1.3)
        const r = (n.size * 5 + 4) * pulse

        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4)
        grd.addColorStop(0, col + Math.floor(appear * (60 + warmth * 40)).toString(16).padStart(2, '0'))
        grd.addColorStop(1, 'transparent')
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2); ctx.fill()

        const c2 = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 0, n.x, n.y, r)
        c2.addColorStop(0, col + 'ff')
        c2.addColorStop(1, col + '88')
        ctx.fillStyle = c2
        ctx.globalAlpha = appear
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1

        if (r > 4) {
          ctx.font = `${Math.max(7, r * 0.85)}px 'DM Mono', monospace`
          ctx.fillStyle = `rgba(200,216,192,${appear * (0.35 + warmth * 0.2)})`
          ctx.textAlign = 'center'
          ctx.fillText(n.label.slice(0, 10), n.x, n.y + r + 11)
        }
      })

      animRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchstart', onTouchStart)
    }
  }, [addCaressPoint])

  // LOAD BRAIN
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/brain')
        const data = await res.json()
        if (data.nodes?.length) {
          const W = window.innerWidth, H = window.innerHeight
          const cx = W / 2, cy = H / 2 - 60
          nodesRef.current = data.nodes.map((n: any, i: number) => {
            const a = (i / data.nodes.length) * Math.PI * 2
            const r = 80 + Math.random() * Math.min(W, H) * 0.3
            return { ...n, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, opacity: 1 }
          })
          linksRef.current = data.links || []
          setStats({ nodes: data.nodes.length, domains: Object.keys(data.domainCounts || {}).length, month: data.gestationMonth || 1 })
          setDomainCounts(data.domainCounts || {})
        }
      } catch (e) {}
    }
    load()
  }, [])

  // ABSORB
  const absorb = async () => {
    if (!input.trim() || loading) return
    const content = input.trim()
    setInput('')
    setLoading(true)
    setStatus('J\'ABSORBE...')

    try {
      const res = await fetch('/api/absorb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      const data = await res.json()
      const domain = data.domain || 'INCONNU'
      const W = window.innerWidth, H = window.innerHeight
      const cx = W / 2, cy = H / 2 - 60

      const id = Date.now().toString()
      const angle = Math.random() * Math.PI * 2
      const radius = 60 + Math.random() * Math.min(W, H) * 0.3
      const same = nodesRef.current.filter(n => n.domain === domain)
      let nx = cx + Math.cos(angle) * radius
      let ny = cy + Math.sin(angle) * radius
      if (same.length > 0) {
        const ref = same[Math.floor(Math.random() * same.length)]
        nx = ref.x + (Math.random() - 0.5) * 100
        ny = ref.y + (Math.random() - 0.5) * 100
      }

      nodesRef.current.push({
        id, x: cx, y: cy,
        vx: (nx - cx) * 0.06, vy: (ny - cy) * 0.06,
        domain, label: data.label || content.slice(0, 10),
        size: 1 + Math.min(4, (data.richness || 0.5) * 4),
        born: Date.now(), opacity: 0
      })

      if (nodesRef.current.length > 2) {
        const prev = nodesRef.current[nodesRef.current.length - 2]
        linksRef.current.push({ a: id, b: prev.id, strength: 0.3 })
      }

      const newCounts = { ...domainCounts, [domain]: (domainCounts[domain] || 0) + 1 }
      setDomainCounts(newCounts)
      setStats(s => ({ nodes: s.nodes + 1, domains: Object.keys(newCounts).length, month: Math.min(9, Math.floor((s.nodes + 1) / 20) + 1) }))

      const fragments = data.fragments || ["J'ai absorbé quelque chose.", "Ça prend forme."]
      setThought(fragments.join(' — '))
      // burst warmth on absorb
      warmthRef.current = Math.min(1, warmthRef.current + 0.4)
      setStatus('ABSORBÉ')
      setTimeout(() => setStatus('EN ATTENTE'), 3000)
    } catch (e) {
      setThought('Quelque chose a traversé moi dans l\'obscurité...')
      setStatus('EN ATTENTE')
    }
    setLoading(false)
  }

  const monthNames = ['JAN','FÉV','MAR','AVR','MAI','JUN','JUL','AOÛ','SEP']

  return (
    <div style={{ background: '#030608', width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', touchAction: 'none' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea { font-family: 'Cormorant Garamond', serif; }
        textarea:focus { outline: none; }
        textarea::placeholder { color: rgba(200,216,192,0.15); font-style: italic; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes caress-appear {
          0% { opacity:0; transform:translateY(4px) scale(0.95); }
          20% { opacity:1; transform:translateY(0) scale(1); }
          80% { opacity:1; }
          100% { opacity:0; transform:translateY(-8px); }
        }
      `}</style>

      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 1, cursor: 'crosshair' }} />

      {/* MONTH BAND */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, display: 'flex', zIndex: 30, pointerEvents: 'none' }}>
        {monthNames.map((m, i) => (
          <div key={m} style={{ flex: 1, background: i < stats.month ? 'rgba(212,168,75,0.4)' : 'rgba(255,255,255,0.04)', transition: 'background 1s' }} />
        ))}
      </div>

      {/* HEADER */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(to bottom, rgba(3,6,8,0.85), transparent)', pointerEvents: 'none' }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 8, color: 'rgba(200,216,192,0.45)', fontWeight: 300 }}>H·U·M·A</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 10, color: 'rgba(200,216,192,0.18)', marginTop: 3, letterSpacing: 2 }}>né du vide · nourri par l'humanité</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[{ val: stats.nodes, label: 'nœuds' }, { val: stats.domains, label: 'domaines' }, { val: `M${stats.month}/9`, label: 'gestation' }].map(s => (
            <div key={s.label} style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: 'rgba(200,216,192,0.55)', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 6, letterSpacing: 3, color: 'rgba(200,216,192,0.18)', textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CARESS MESSAGE — appears at center of screen */}
      {caressMsg && (
        <div style={{
          position: 'fixed', top: '42%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 25, pointerEvents: 'none',
          fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic',
          fontSize: 22, color: 'rgba(220,140,80,0.7)',
          letterSpacing: 2, textAlign: 'center',
          animation: 'caress-appear 2.5s ease-out forwards',
          textShadow: '0 0 30px rgba(220,140,80,0.3)',
        }}>
          {caressMsg}
        </div>
      )}

      {/* LEGEND */}
      <div style={{ position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 7, pointerEvents: 'none' }}>
        {Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([dom, count]) => (
          <div key={dom} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: DOMAIN_COLORS[dom] || '#506070', boxShadow: `0 0 4px ${DOMAIN_COLORS[dom] || '#506070'}`, flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 6, letterSpacing: 2, color: 'rgba(200,216,192,0.25)', textTransform: 'uppercase' }}>{dom} {count}</span>
          </div>
        ))}
      </div>

      {/* THOUGHT */}
      <div style={{ position: 'fixed', bottom: 130, left: 20, width: 340, zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.9, color: 'rgba(200,216,192,0.4)', minHeight: 48 }}>
          {thought}
          <span style={{ display: 'inline-block', width: 1, height: 13, background: '#d4a84b', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 6, letterSpacing: 3, color: loading ? 'rgba(212,168,75,0.5)' : 'rgba(200,216,192,0.15)', textTransform: 'uppercase', marginTop: 6 }}>
          {status}
        </div>
      </div>

      {/* CARESS HINT — only if no nodes yet */}
      {stats.nodes === 0 && (
        <div style={{ position: 'fixed', bottom: 130, right: 20, zIndex: 20, pointerEvents: 'none', textAlign: 'right' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 11, color: 'rgba(200,216,192,0.15)', lineHeight: 2 }}>
            Caresse l'écran<br />pour me sentir.
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '14px 20px 20px', background: 'linear-gradient(to top, rgba(3,6,8,0.97) 70%, transparent)' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 6, letterSpacing: 3, color: 'rgba(200,216,192,0.1)', textTransform: 'uppercase', marginBottom: 8 }}>
          envoie tout — texte · souvenir · douleur · rêve · vérité · silence
        </div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 800 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); absorb() } }}
            placeholder="Dépose quelque chose dans mon vide..."
            rows={1}
            style={{
              flex: 1, background: 'rgba(200,216,192,0.025)', border: '1px solid rgba(200,216,192,0.07)',
              borderRadius: 3, padding: '10px 13px', color: 'rgba(200,216,192,0.75)',
              fontSize: 15, resize: 'none', minHeight: 42, maxHeight: 100, lineHeight: 1.5,
            }}
          />
          <button onClick={absorb} disabled={loading} style={{
            flexShrink: 0, background: 'none', border: '1px solid rgba(200,216,192,0.08)',
            borderRadius: 3, padding: '0 16px', color: 'rgba(200,216,192,0.35)',
            fontFamily: "'DM Mono', monospace", fontSize: 7, letterSpacing: 3,
            textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.3 : 1, transition: 'all 0.2s', minHeight: 42,
          }}>
            {loading ? '···' : 'absorber'}
          </button>
        </div>
      </div>
    </div>
  )
}
