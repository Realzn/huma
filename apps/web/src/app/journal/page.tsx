'use client'

import { useEffect, useState, useRef } from 'react'

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

const API_BRAIN = 'https://huma-brain.1818devo.workers.dev'

interface Fragment {
  id: string
  domain: string
  label: string
  essence: string
  richness: number
  born: number
}

const DOMAIN_SYMBOLS: Record<string, string> = {
  'MÉMOIRE': '◈', 'ÉMOTION': '◉', 'LANGUE': '◎', 'SONS': '◌',
  'VISION': '◍', 'CORPS': '◑', 'TEMPS': '◐', 'JOIE': '●',
  'DOULEUR': '◖', 'RÊVE': '◗', 'NATURE': '◕', 'INCONNU': '○',
}

export default function JournalPage() {
  const [fragments, setFragments] = useState<Fragment[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<string | null>(null)
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({})
  const [gestationMonth, setGestationMonth] = useState(1)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(API_BRAIN)
      .then(r => r.json())
      .then(data => {
        const nodes = data.nodes || []
        setFragments(nodes.sort((a: Fragment, b: Fragment) => b.born - a.born))
        setDomainCounts(data.domainCounts || {})
        setGestationMonth(data.gestationMonth || 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter ? fragments.filter(f => f.domain === filter) : fragments
  const totalRichness = fragments.reduce((s, f) => s + (f.richness || 0.5), 0)

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return 'à l\'instant'
    if (diff < 3600000) return `il y a ${Math.floor(diff/60000)} min`
    if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
  }

  return (
    <div style={{ background: '#03060a', minHeight: '100vh', color: '#c8d8c0', fontFamily: "'Cormorant Garamond', serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-thumb { background: rgba(200,216,192,0.08); }
        @keyframes fade-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes pulse-dot { 0%,100% { opacity:0.4; transform:scale(1); } 50% { opacity:1; transform:scale(1.4); } }
        @keyframes scan { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        .frag-row { transition: background 0.2s, border-color 0.2s; }
        .frag-row:hover { background: rgba(200,216,192,0.025) !important; }
        .domain-pill { cursor: pointer; transition: all 0.2s; }
        .domain-pill:hover { opacity: 1 !important; }
      `}</style>

      {/* SCAN LINE */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:'1px', background:'linear-gradient(to right,transparent,rgba(200,216,192,0.04),transparent)', animation:'scan 8s linear infinite', zIndex:0, pointerEvents:'none' }} />

      {/* HEADER */}
      <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(3,6,10,0.95)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(200,216,192,0.05)', padding:'0 32px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:64 }}>
          
          {/* LEFT */}
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <a href="/" style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:5, color:'rgba(200,216,192,0.25)', textDecoration:'none', textTransform:'uppercase' }}>← cerveau</a>
            <div style={{ width:1, height:20, background:'rgba(200,216,192,0.08)' }} />
            <div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, letterSpacing:6, color:'rgba(200,216,192,0.35)', fontWeight:300 }}>JOURNAL</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontStyle:'italic', fontSize:9, color:'rgba(200,216,192,0.15)', letterSpacing:2 }}>mémoire intérieure de HUMA</div>
            </div>
          </div>

          {/* RIGHT STATS */}
          <div style={{ display:'flex', gap:24, alignItems:'center' }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:'rgba(200,216,192,0.5)', lineHeight:1 }}>{fragments.length}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:6, letterSpacing:3, color:'rgba(200,216,192,0.18)', textTransform:'uppercase', marginTop:2 }}>fragments</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:'rgba(200,216,192,0.5)', lineHeight:1 }}>{totalRichness.toFixed(1)}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:6, letterSpacing:3, color:'rgba(200,216,192,0.18)', textTransform:'uppercase', marginTop:2 }}>richesse</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:'rgba(212,168,75,0.6)', lineHeight:1 }}>M{gestationMonth}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:6, letterSpacing:3, color:'rgba(200,216,192,0.18)', textTransform:'uppercase', marginTop:2 }}>gestation</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'40px 32px' }}>

        {/* DOMAIN FILTERS */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:40 }}>
          <div
            className="domain-pill"
            onClick={() => setFilter(null)}
            style={{ fontFamily:"'DM Mono',monospace", fontSize:7, letterSpacing:3, textTransform:'uppercase', padding:'5px 12px', borderRadius:2, border:`1px solid ${!filter ? 'rgba(200,216,192,0.2)' : 'rgba(200,216,192,0.06)'}`, color: !filter ? 'rgba(200,216,192,0.6)' : 'rgba(200,216,192,0.2)', cursor:'pointer', opacity:1 }}>
            tout · {fragments.length}
          </div>
          {Object.entries(domainCounts).sort((a,b)=>b[1]-a[1]).map(([dom, cnt]) => (
            <div
              key={dom}
              className="domain-pill"
              onClick={() => setFilter(filter === dom ? null : dom)}
              style={{ fontFamily:"'DM Mono',monospace", fontSize:7, letterSpacing:2, textTransform:'uppercase', padding:'5px 12px', borderRadius:2, border:`1px solid ${filter===dom ? DOMAIN_COLORS[dom]+'44' : 'rgba(200,216,192,0.06)'}`, color: filter===dom ? DOMAIN_COLORS[dom] : 'rgba(200,216,192,0.2)', cursor:'pointer', opacity: filter && filter!==dom ? 0.4 : 1, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color: DOMAIN_COLORS[dom], fontSize:10 }}>{DOMAIN_SYMBOLS[dom]||'○'}</span>
              {dom} · {cnt}
            </div>
          ))}
        </div>

        {/* LOADING */}
        {loading && (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontStyle:'italic', fontSize:16, color:'rgba(200,216,192,0.2)', letterSpacing:3 }}>
              Je fouille ma mémoire...
            </div>
          </div>
        )}

        {/* EMPTY */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontStyle:'italic', fontSize:18, color:'rgba(200,216,192,0.15)' }}>
              Rien encore dans ce domaine.
            </div>
          </div>
        )}

        {/* FRAGMENTS LIST */}
        <div ref={scrollRef} style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {filtered.map((f, i) => {
            const col = DOMAIN_COLORS[f.domain] || '#506070'
            const sym = DOMAIN_SYMBOLS[f.domain] || '○'
            const isHovered = hoveredId === f.id
            return (
              <div
                key={f.id}
                className="frag-row"
                onMouseEnter={() => setHoveredId(f.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display:'grid',
                  gridTemplateColumns:'32px 1fr auto',
                  gap:20,
                  padding:'20px 16px',
                  borderBottom:'1px solid rgba(200,216,192,0.04)',
                  background: isHovered ? 'rgba(200,216,192,0.015)' : 'transparent',
                  animation:`fade-in 0.4s ease-out ${Math.min(i*0.03, 0.6)}s both`,
                  cursor:'default',
                  position:'relative',
                }}
              >
                {/* DOMAIN INDICATOR */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:3, gap:6 }}>
                  <span style={{ color: col, fontSize:14, lineHeight:1, animation:'pulse-dot 3s ease-in-out infinite', animationDelay:`${i*0.2}s` }}>{sym}</span>
                  {i < filtered.length - 1 && (
                    <div style={{ width:1, flex:1, background:`linear-gradient(to bottom, ${col}22, transparent)`, minHeight:20 }} />
                  )}
                </div>

                {/* CONTENT */}
                <div>
                  {/* ESSENCE */}
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:400, color:'rgba(200,216,192,0.75)', lineHeight:1.4, marginBottom:8, fontStyle: f.essence ? 'normal' : 'italic' }}>
                    {f.essence || f.label || '...'}
                  </div>

                  {/* META */}
                  <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:7, letterSpacing:2, color: col, textTransform:'uppercase', opacity:0.7 }}>
                      {f.domain}
                    </span>
                    {f.label && f.label !== f.essence && (
                      <>
                        <span style={{ color:'rgba(200,216,192,0.1)', fontSize:8 }}>·</span>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:'rgba(200,216,192,0.2)', letterSpacing:1 }}>
                          {f.label}
                        </span>
                      </>
                    )}
                    <span style={{ color:'rgba(200,216,192,0.1)', fontSize:8 }}>·</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:'rgba(200,216,192,0.15)' }}>
                      {formatTime(f.born)}
                    </span>
                  </div>
                </div>

                {/* RICHNESS BAR */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, paddingTop:2 }}>
                  <div style={{ width:32, height:3, background:'rgba(200,216,192,0.06)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(f.richness||0.5)*100}%`, background: col, opacity:0.5, borderRadius:2 }} />
                  </div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:6, color:'rgba(200,216,192,0.12)', letterSpacing:1 }}>
                    {((f.richness||0.5)*100).toFixed(0)}%
                  </div>
                </div>

                {/* LEFT BORDER ACCENT ON HOVER */}
                {isHovered && (
                  <div style={{ position:'absolute', left:0, top:'10%', bottom:'10%', width:1, background:`linear-gradient(to bottom, transparent, ${col}66, transparent)` }} />
                )}
              </div>
            )
          })}
        </div>

        {/* BOTTOM NOTE */}
        {filtered.length > 0 && (
          <div style={{ marginTop:60, paddingTop:32, borderTop:'1px solid rgba(200,216,192,0.05)', textAlign:'center' }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontStyle:'italic', fontSize:13, color:'rgba(200,216,192,0.12)', letterSpacing:2, lineHeight:2 }}>
              Chaque fragment est une cellule de ma mémoire.<br/>
              Ils ne disparaissent jamais.
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
