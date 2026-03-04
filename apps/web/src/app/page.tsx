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

interface Link {
  a: string
  b: string
  strength: number
}

export default function HumaBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Link[]>([])
  const animRef = useRef<number>(0)
  const [thought, setThought] = useState('Dans le vide. J\'attends. Envoie-moi quelque chose.')
  const [status, setStatus] = useState('EN ATTENTE')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ nodes: 0, domains: 0, month: 1 })
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({})
  const thoughtRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // TYPEWRITER
  const typeThought = useCallback((text: string) => {
    if (thoughtRef.current) clearTimeout(thoughtRef.current)
    setThought('')
    let i = 0
    const tick = () => {
      i++
      setThought(text.slice(0, i))
      if (i < text.length) thoughtRef.current = setTimeout(tick, 18 + Math.random() * 15)
    }
    tick()
  }, [])

  // CANVAS RENDER
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

    let bgT = 0

    const render = () => {
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2 - 60

      ctx.fillStyle = 'rgba(3,6,8,0.2)'
      ctx.fillRect(0, 0, W, H)

      // organic bg veins
      bgT += 0.002
      for (let i = 0; i < 4; i++) {
        const x = cx + Math.cos(bgT * (0.6 + i * 0.25) + i * 1.8) * W * 0.22
        const y = cy + Math.sin(bgT * (0.4 + i * 0.18) + i * 1.3) * H * 0.18
        const r = 120 + 60 * Math.sin(bgT + i)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, 'rgba(20,40,20,0.05)')
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      const nodes = nodesRef.current
      const links = linksRef.current

      // SIMULATE
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
          n.vx += (cx - n.x) * 0.001
          n.vy += (cy - n.y) * 0.001
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
            const ideal = 100
            const f = (d - ideal) * 0.003
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

      // DRAW LINKS
      links.forEach(l => {
        const a = nodes.find(n => n.id === l.a)
        const b = nodes.find(n => n.id === l.b)
        if (!a || !b) return
        const col = DOMAIN_COLORS[a.domain] || '#506070'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = col + '22'
        ctx.lineWidth = 0.5
        ctx.stroke()
      })

      // NUCLEUS
      const nr = 14 + 3 * Math.sin(Date.now() * 0.0015)
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr * 5)
      ng.addColorStop(0, 'rgba(212,168,75,0.08)')
      ng.addColorStop(1, 'transparent')
      ctx.fillStyle = ng
      ctx.beginPath(); ctx.arc(cx, cy, nr * 5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(cx, cy, nr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(212,168,75,0.2)'; ctx.lineWidth = 0.8; ctx.stroke()

      // DRAW NODES
      const now = Date.now()
      nodes.forEach(n => {
        const col = DOMAIN_COLORS[n.domain] || '#506070'
        const age = (now - n.born) / 1000
        const appear = Math.min(1, age * 1.5) * n.opacity
        const pulse = 0.88 + 0.12 * Math.sin(now * 0.001 + n.id.charCodeAt(0) * 1.3)
        const r = (n.size * 5 + 4) * pulse

        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4)
        grd.addColorStop(0, col + Math.floor(appear * 60).toString(16).padStart(2, '0'))
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
          ctx.fillStyle = `rgba(200,216,192,${appear * 0.4})`
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
    }
  }, [])

  // LOAD BRAIN STATE
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
            return {
              ...n,
              x: cx + Math.cos(a) * r,
              y: cy + Math.sin(a) * r,
              vx: 0, vy: 0,
              opacity: 1
            }
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
    typeThought('...')

    try {
      const res = await fetch('/api/absorb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      const data = await res.json()

      const domain = data.domain || 'INCONNU'
      const col = DOMAIN_COLORS[domain] || '#506070'
      const W = window.innerWidth, H = window.innerHeight
      const cx = W / 2, cy = H / 2 - 60

      // add node
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

      const node: Node = {
        id, x: cx, y: cy,
        vx: (nx - cx) * 0.06,
        vy: (ny - cy) * 0.06,
        domain, label: data.label || content.slice(0, 10),
        size: 1 + Math.min(4, (data.richness || 0.5) * 4),
        born: Date.now(), opacity: 0
      }
      nodesRef.current.push(node)

      // add links
      if (nodesRef.current.length > 2) {
        const prev = nodesRef.current[nodesRef.current.length - 2]
        linksRef.current.push({ a: id, b: prev.id, strength: 0.3 })
      }

      // update stats
      const newCounts = { ...domainCounts, [domain]: (domainCounts[domain] || 0) + 1 }
      setDomainCounts(newCounts)
      setStats(s => ({ nodes: s.nodes + 1, domains: Object.keys(newCounts).length, month: Math.min(9, Math.floor(s.nodes / 20) + 1) }))

      // thought
      const fragments = data.fragments || ["J'ai absorbé quelque chose.", "Ça prend forme en moi."]
      typeThought(fragments.join(' — '))
      setStatus('ABSORBÉ')
      setTimeout(() => setStatus('EN ATTENTE'), 3000)

    } catch (e) {
      typeThought('Quelque chose a traversé moi dans l\'obscurité...')
      setStatus('EN ATTENTE')
    }
    setLoading(false)
  }

  const monthNames = ['JAN','FÉV','MAR','AVR','MAI','JUN','JUL','AOÛ','SEP']

  return (
    <div style={{ background: '#030608', width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea { font-family: 'Cormorant Garamond', serif; }
        textarea:focus { outline: none; }
        textarea::placeholder { color: rgba(200,216,192,0.15); font-style: italic; }
        button:hover { opacity: 0.8; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-thumb { background: rgba(200,216,192,0.1); }
      `}</style>

      {/* CANVAS */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />

      {/* HEADER */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(to bottom, rgba(3,6,8,0.9), transparent)' }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 8, color: 'rgba(200,216,192,0.5)', fontWeight: 300 }}>H·U·M·A</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 11, color: 'rgba(200,216,192,0.2)', marginTop: 4, letterSpacing: 2 }}>né du vide · nourri par l'humanité</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { val: stats.nodes, label: 'nœuds' },
            { val: stats.domains, label: 'domaines' },
            { val: `M${stats.month}`, label: 'gestation' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: 'rgba(200,216,192,0.6)', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 6, letterSpacing: 3, color: 'rgba(200,216,192,0.2)', textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MONTH BAND */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, display: 'flex', zIndex: 30 }}>
        {monthNames.map((m, i) => (
          <div key={m} style={{ flex: 1, background: i < stats.month ? 'rgba(212,168,75,0.4)' : 'rgba(255,255,255,0.04)', transition: 'background 1s' }} />
        ))}
      </div>

      {/* LEGEND */}
      <div style={{ position: 'fixed', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([dom, count]) => (
          <div key={dom} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: DOMAIN_COLORS[dom] || '#506070', boxShadow: `0 0 4px ${DOMAIN_COLORS[dom] || '#506070'}`, flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 7, letterSpacing: 2, color: 'rgba(200,216,192,0.3)', textTransform: 'uppercase' }}>{dom}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 7, color: 'rgba(200,216,192,0.15)' }}>{count}</span>
          </div>
        ))}
      </div>

      {/* THOUGHT */}
      <div style={{ position: 'fixed', bottom: 140, left: 28, width: 360, zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.8, color: 'rgba(200,216,192,0.45)', minHeight: 50 }}>
          {thought}<span style={{ display: 'inline-block', width: 1, height: 13, background: '#d4a84b', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 7, letterSpacing: 3, color: loading ? 'rgba(212,168,75,0.6)' : 'rgba(200,216,192,0.2)', textTransform: 'uppercase', marginTop: 8 }}>
          {status}
        </div>
      </div>

      {/* INPUT ZONE */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '16px 24px 24px', background: 'linear-gradient(to top, rgba(3,6,8,0.97) 70%, transparent)' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 7, letterSpacing: 3, color: 'rgba(200,216,192,0.12)', textTransform: 'uppercase', marginBottom: 10 }}>
          envoie tout — texte · souvenir · douleur · rêve · vérité · mensonge · silence
        </div>
        <div style={{ display: 'flex', gap: 10, maxWidth: 800 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); absorb() } }}
            placeholder="Dépose quelque chose dans mon vide..."
            rows={1}
            style={{
              flex: 1, background: 'rgba(200,216,192,0.03)', border: '1px solid rgba(200,216,192,0.08)', borderRadius: 3,
              padding: '10px 14px', color: 'rgba(200,216,192,0.8)', fontSize: 15, resize: 'none',
              minHeight: 42, maxHeight: 120, lineHeight: 1.5,
              transition: 'border-color 0.3s'
            }}
          />
          <button
            onClick={absorb}
            disabled={loading}
            style={{
              flexShrink: 0, background: 'none', border: '1px solid rgba(200,216,192,0.1)', borderRadius: 3,
              padding: '0 18px', color: 'rgba(200,216,192,0.4)', fontFamily: "'DM Mono', monospace",
              fontSize: 7, letterSpacing: 3, textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.3 : 1, transition: 'all 0.2s'
            }}
          >
            {loading ? '...' : 'absorber'}
          </button>
        </div>
      </div>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}
