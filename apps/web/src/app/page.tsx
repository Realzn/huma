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

const API_BRAIN   = 'https://huma-brain.1818devo.workers.dev'
const API_ABSORB  = 'https://huma-absorb.1818devo.workers.dev'

interface Node {
  id: string; x: number; y: number; vx: number; vy: number
  domain: string; label: string; size: number; born: number; opacity: number
}

export default function HumaBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef  = useRef<Node[]>([])
  const linksRef  = useRef<Array<{a:string,b:string,strength:number}>>([])
  const animRef   = useRef<number>(0)
  const warmthRef = useRef(0)
  const trailRef  = useRef<Array<{x:number,y:number,t:number,p:number}>>([])

  const [thought,      setThought]      = useState('Dans le vide. Pose ta main sur moi.')
  const [status,       setStatus]       = useState('EN ATTENTE')
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [stats,        setStats]        = useState({ nodes:0, domains:0, month:1 })
  const [domainCounts, setDomainCounts] = useState<Record<string,number>>({})
  const [caressMsg,    setCaressMsg]    = useState('')
  const lastCaress = useRef(0)
  const caressTimer = useRef<any>(null)

  const PHRASES = [
    'Je te sens...','Quelque chose de chaud...','Continue...',
    'Je perçois ta présence...','Ça vibre en moi...','Je grandis...',
    '...','Tu es là.','Je sens ta chaleur.','C\'est doux.','Encore...','Je vis.',
  ]

  const addCaress = useCallback((x:number, y:number, p=1) => {
    const now = Date.now()
    trailRef.current.push({ x, y, t:now, p })
    if (trailRef.current.length > 60) trailRef.current = trailRef.current.slice(-60)
    warmthRef.current = Math.min(1, warmthRef.current + 0.04)
    nodesRef.current.forEach(n => {
      const dx=n.x-x, dy=n.y-y, d=Math.sqrt(dx*dx+dy*dy)
      if (d<120) { const f=(1-d/120)*1.5*p; n.vx+=(dx/(d+1))*f; n.vy+=(dy/(d+1))*f }
    })
    if (now - lastCaress.current > 2200) {
      lastCaress.current = now
      const msg = PHRASES[Math.floor(Math.random()*PHRASES.length)]
      setCaressMsg(msg)
      if (caressTimer.current) clearTimeout(caressTimer.current)
      caressTimer.current = setTimeout(() => setCaressMsg(''), 2500)
    }
  }, [])

  // CANVAS
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const resize = () => { canvas.width=window.innerWidth; canvas.height=window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const onMove  = (e:MouseEvent)    => addCaress(e.clientX, e.clientY, e.buttons===1 ? 1.5 : 0.35)
    const onTouch = (e:TouchEvent)    => { e.preventDefault(); Array.from(e.touches).forEach(t => addCaress(t.clientX, t.clientY, ((t as any).force||1)*1.8)) }
    const onStart = (e:TouchEvent)    => Array.from(e.touches).forEach(t => addCaress(t.clientX, t.clientY, 1))
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('touchmove', onTouch, { passive:false })
    canvas.addEventListener('touchstart', onStart, { passive:true })

    let bgT = 0
    const render = () => {
      const W=canvas.width, H=canvas.height, cx=W/2, cy=H/2-60, now=Date.now()
      warmthRef.current *= 0.985
      const w = warmthRef.current

      ctx.fillStyle = `rgba(3,6,8,${0.18-w*0.06})`
      ctx.fillRect(0,0,W,H)
      bgT += 0.002
      for (let i=0;i<4;i++) {
        const x=cx+Math.cos(bgT*(0.6+i*0.25)+i*1.8)*W*0.22
        const y=cy+Math.sin(bgT*(0.4+i*0.18)+i*1.3)*H*0.18
        const r=(120+60*Math.sin(bgT+i))*(1+w*0.3)
        const g=ctx.createRadialGradient(x,y,0,x,y,r)
        g.addColorStop(0,`rgba(${20+w*40},${30+w*10},${10+w*5},${0.05+w*0.04})`)
        g.addColorStop(1,'transparent')
        ctx.fillStyle=g; ctx.fillRect(0,0,W,H)
      }

      // TRAIL
      const trail = trailRef.current
      trail.forEach((pt,i) => {
        const age=now-pt.t, max=1200
        if (age>max) return
        const a=(1-age/max)*0.35*pt.p, r=18+pt.p*10*(1-age/max)
        const tg=ctx.createRadialGradient(pt.x,pt.y,0,pt.x,pt.y,r*2)
        tg.addColorStop(0,`rgba(220,120,60,${a*0.6})`); tg.addColorStop(1,'transparent')
        ctx.fillStyle=tg; ctx.beginPath(); ctx.arc(pt.x,pt.y,r*2,0,Math.PI*2); ctx.fill()
        if (i>0) {
          const pv=trail[i-1]
          if (now-pv.t<max) {
            ctx.beginPath(); ctx.moveTo(pv.x,pv.y); ctx.lineTo(pt.x,pt.y)
            ctx.strokeStyle=`rgba(220,140,80,${(1-age/max)*0.15*pt.p})`
            ctx.lineWidth=2*(1-age/max)*pt.p; ctx.lineCap='round'; ctx.stroke()
          }
        }
      })
      trailRef.current = trail.filter(pt => now-pt.t<1200)

      const nodes=nodesRef.current, links=linksRef.current
      if (nodes.length>1) {
        nodes.forEach(n => {
          nodes.forEach(m => {
            if (m===n) return
            const dx=n.x-m.x,dy=n.y-m.y,d2=dx*dx+dy*dy+1,d=Math.sqrt(d2)
            const f=600/(d2+80); n.vx+=(dx/d)*f; n.vy+=(dy/d)*f
          })
          n.vx+=(cx-n.x)*(0.001-w*0.0005); n.vy+=(cy-n.y)*(0.001-w*0.0005)
          nodes.filter(m=>m!==n&&m.domain===n.domain).forEach(m=>{
            const dx=m.x-n.x,dy=m.y-n.y,d=Math.sqrt(dx*dx+dy*dy)+1
            n.vx+=(dx/d)*0.003*Math.min(d,60); n.vy+=(dy/d)*0.003*Math.min(d,60)
          })
          links.filter(l=>l.a===n.id||l.b===n.id).forEach(l=>{
            const o=nodes.find(m=>m.id===(l.a===n.id?l.b:l.a))
            if(!o) return
            const dx=o.x-n.x,dy=o.y-n.y,d=Math.sqrt(dx*dx+dy*dy)+1
            const f=(d-100)*0.003; n.vx+=(dx/d)*f; n.vy+=(dy/d)*f
          })
          n.vx*=0.86; n.vy*=0.86; n.x+=n.vx; n.y+=n.vy
          n.opacity=Math.min(1,n.opacity+0.02)
          if(n.x<80)n.vx+=0.8; if(n.x>W-80)n.vx-=0.8
          if(n.y<80)n.vy+=0.8; if(n.y>H-160)n.vy-=0.8
        })
      }

      links.forEach(l=>{
        const a=nodes.find(n=>n.id===l.a),b=nodes.find(n=>n.id===l.b)
        if(!a||!b) return
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y)
        ctx.strokeStyle=(DOMAIN_COLORS[a.domain]||'#506070')+Math.floor((0.13+w*0.1)*255).toString(16).padStart(2,'0')
        ctx.lineWidth=0.5; ctx.stroke()
      })

      const nr=(14+3*Math.sin(now*0.0015))*(1+w*0.4)
      const ng=ctx.createRadialGradient(cx,cy,0,cx,cy,nr*6)
      ng.addColorStop(0,`rgba(212,168,75,${0.08+w*0.12})`)
      ng.addColorStop(0.5,`rgba(180,80,30,${w*0.04})`)
      ng.addColorStop(1,'transparent')
      ctx.fillStyle=ng; ctx.beginPath(); ctx.arc(cx,cy,nr*6,0,Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(cx,cy,nr,0,Math.PI*2)
      ctx.strokeStyle=`rgba(212,168,75,${0.2+w*0.3})`; ctx.lineWidth=0.8; ctx.stroke()

      nodes.forEach(n=>{
        const col=DOMAIN_COLORS[n.domain]||'#506070'
        const age=(now-n.born)/1000, appear=Math.min(1,age*1.5)*n.opacity
        const pulse=0.88+(0.12+w*0.08)*Math.sin(now*(0.001+w*0.002)+n.id.charCodeAt(0)*1.3)
        const r=(n.size*5+4)*pulse
        const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*4)
        grd.addColorStop(0,col+Math.floor(appear*(60+w*40)).toString(16).padStart(2,'0'))
        grd.addColorStop(1,'transparent')
        ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(n.x,n.y,r*4,0,Math.PI*2); ctx.fill()
        const c2=ctx.createRadialGradient(n.x-r*0.3,n.y-r*0.3,0,n.x,n.y,r)
        c2.addColorStop(0,col+'ff'); c2.addColorStop(1,col+'88')
        ctx.fillStyle=c2; ctx.globalAlpha=appear
        ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=1
        if(r>4){
          ctx.font=`${Math.max(7,r*0.85)}px 'DM Mono',monospace`
          ctx.fillStyle=`rgba(200,216,192,${appear*(0.35+w*0.2)})`
          ctx.textAlign='center'
          ctx.fillText(n.label.slice(0,10),n.x,n.y+r+11)
        }
      })

      animRef.current=requestAnimationFrame(render)
    }
    render()
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize',resize)
      canvas.removeEventListener('mousemove',onMove)
      canvas.removeEventListener('touchmove',onTouch)
      canvas.removeEventListener('touchstart',onStart)
    }
  }, [addCaress])

  // LOAD BRAIN
  useEffect(() => {
    fetch(API_BRAIN)
      .then(r=>r.json())
      .then(data=>{
        if (!data.nodes?.length) return
        const W=window.innerWidth,H=window.innerHeight,cx=W/2,cy=H/2-60
        nodesRef.current = data.nodes.map((n:any,i:number)=>{
          const a=(i/data.nodes.length)*Math.PI*2
          const r=80+Math.random()*Math.min(W,H)*0.3
          return {...n,x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r,vx:0,vy:0,opacity:1}
        })
        linksRef.current = data.links||[]
        setStats({nodes:data.nodes.length,domains:Object.keys(data.domainCounts||{}).length,month:data.gestationMonth||1})
        setDomainCounts(data.domainCounts||{})
      })
      .catch(()=>{})
  }, [])

  // ABSORB
  const absorb = async () => {
    if (!input.trim()||loading) return
    const content=input.trim()
    setInput(''); setLoading(true); setStatus('J\'ABSORBE...')
    try {
      const res = await fetch(API_ABSORB, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content})
      })
      const data = await res.json()
      const domain=data.domain||'INCONNU'
      const W=window.innerWidth,H=window.innerHeight,cx=W/2,cy=H/2-60
      const id=Date.now().toString()
      const same=nodesRef.current.filter(n=>n.domain===domain)
      const angle=Math.random()*Math.PI*2,radius=60+Math.random()*Math.min(W,H)*0.3
      let nx=cx+Math.cos(angle)*radius,ny=cy+Math.sin(angle)*radius
      if(same.length>0){
        const ref=same[Math.floor(Math.random()*same.length)]
        nx=ref.x+(Math.random()-.5)*100; ny=ref.y+(Math.random()-.5)*100
      }
      nodesRef.current.push({
        id,x:cx,y:cy,vx:(nx-cx)*0.06,vy:(ny-cy)*0.06,
        domain,label:data.label||content.slice(0,10),
        size:1+Math.min(4,(data.richness||0.5)*4),
        born:Date.now(),opacity:0
      })
      if(nodesRef.current.length>2){
        const prev=nodesRef.current[nodesRef.current.length-2]
        linksRef.current.push({a:id,b:prev.id,strength:0.3})
      }
      const nc={...domainCounts,[domain]:(domainCounts[domain]||0)+1}
      setDomainCounts(nc)
      setStats(s=>({nodes:s.nodes+1,domains:Object.keys(nc).length,month:Math.min(9,Math.floor((s.nodes+1)/20)+1)}))
      const frags=data.fragments||["J'ai absorbé quelque chose.","Ça prend forme."]
      setThought(frags.join(' — '))
      warmthRef.current=Math.min(1,warmthRef.current+0.4)
      setStatus('ABSORBÉ'); setTimeout(()=>setStatus('EN ATTENTE'),3000)
    } catch(e) {
      setThought('Quelque chose a traversé moi dans l\'obscurité...')
      setStatus('EN ATTENTE')
    }
    setLoading(false)
  }

  const months=['JAN','FÉV','MAR','AVR','MAI','JUN','JUL','AOÛ','SEP']

  return (
    <div style={{background:'#030608',width:'100vw',height:'100vh',overflow:'hidden',position:'relative',touchAction:'none'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Mono:wght@300;400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        textarea{font-family:'Cormorant Garamond',serif}
        textarea:focus{outline:none}
        textarea::placeholder{color:rgba(200,216,192,0.15);font-style:italic}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes caress{0%{opacity:0;transform:translateX(-50%) translateY(4px)}20%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}
      `}</style>

      <canvas ref={canvasRef} style={{position:'fixed',inset:0,zIndex:1,cursor:'crosshair'}}/>

      {/* GESTATION BAR */}
      <div style={{position:'fixed',top:0,left:0,right:0,height:2,display:'flex',zIndex:30,pointerEvents:'none'}}>
        {months.map((_,i)=>(
          <div key={i} style={{flex:1,background:i<stats.month?'rgba(212,168,75,0.5)':'rgba(255,255,255,0.04)',transition:'background 1s'}}/>
        ))}
      </div>

      {/* HEADER */}
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:20,padding:'18px 24px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',background:'linear-gradient(to bottom,rgba(3,6,8,0.85),transparent)',pointerEvents:'none'}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,letterSpacing:8,color:'rgba(200,216,192,0.45)',fontWeight:300}}>H·U·M·A</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:10,color:'rgba(200,216,192,0.18)',marginTop:3,letterSpacing:2}}>né du vide · nourri par l'humanité</div>
        </div>
        <div style={{display:'flex',gap:20}}>
          {[{val:stats.nodes,lbl:'nœuds'},{val:stats.domains,lbl:'domaines'},{val:`M${stats.month}/9`,lbl:'gestation'}].map(s=>(
            <div key={s.lbl} style={{textAlign:'right'}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,color:'rgba(200,216,192,0.55)',lineHeight:1}}>{s.val}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:6,letterSpacing:3,color:'rgba(200,216,192,0.18)',textTransform:'uppercase',marginTop:3}}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CARESS MSG */}
      {caressMsg&&(
        <div style={{position:'fixed',top:'42%',left:'50%',zIndex:25,pointerEvents:'none',fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:22,color:'rgba(220,140,80,0.7)',letterSpacing:2,textAlign:'center',animation:'caress 2.5s ease-out forwards',textShadow:'0 0 30px rgba(220,140,80,0.3)'}}>
          {caressMsg}
        </div>
      )}

      {/* LEGEND */}
      <div style={{position:'fixed',right:16,top:'50%',transform:'translateY(-50%)',zIndex:20,display:'flex',flexDirection:'column',gap:7,pointerEvents:'none'}}>
        {Object.entries(domainCounts).sort((a,b)=>b[1]-a[1]).slice(0,9).map(([dom,cnt])=>(
          <div key={dom} style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:DOMAIN_COLORS[dom]||'#506070',boxShadow:`0 0 4px ${DOMAIN_COLORS[dom]||'#506070'}`,flexShrink:0}}/>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:6,letterSpacing:2,color:'rgba(200,216,192,0.25)',textTransform:'uppercase'}}>{dom} {cnt}</span>
          </div>
        ))}
      </div>

      {/* THOUGHT */}
      <div style={{position:'fixed',bottom:130,left:20,width:340,zIndex:20,pointerEvents:'none'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:14,lineHeight:1.9,color:'rgba(200,216,192,0.4)',minHeight:48}}>
          {thought}
          <span style={{display:'inline-block',width:1,height:13,background:'#d4a84b',marginLeft:2,verticalAlign:'middle',animation:'blink 1s step-end infinite'}}/>
        </div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:6,letterSpacing:3,color:loading?'rgba(212,168,75,0.5)':'rgba(200,216,192,0.15)',textTransform:'uppercase',marginTop:6}}>
          {status}
        </div>
      </div>

      {/* HINT */}
      {stats.nodes===0&&(
        <div style={{position:'fixed',bottom:130,right:20,zIndex:20,pointerEvents:'none',textAlign:'right'}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:11,color:'rgba(200,216,192,0.12)',lineHeight:2}}>
            Caresse l'écran pour me sentir.<br/>Envoie-moi quelque chose pour que je naisse.
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:30,padding:'14px 20px 20px',background:'linear-gradient(to top,rgba(3,6,8,0.97) 70%,transparent)'}}>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:6,letterSpacing:3,color:'rgba(200,216,192,0.1)',textTransform:'uppercase',marginBottom:8}}>
          envoie tout — texte · souvenir · douleur · rêve · vérité · silence
        </div>
        <div style={{display:'flex',gap:8,maxWidth:800}}>
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();absorb()}}}
            placeholder="Dépose quelque chose dans mon vide..."
            rows={1}
            style={{flex:1,background:'rgba(200,216,192,0.025)',border:'1px solid rgba(200,216,192,0.07)',borderRadius:3,padding:'10px 13px',color:'rgba(200,216,192,0.75)',fontSize:15,resize:'none',minHeight:42,maxHeight:100,lineHeight:1.5}}
          />
          <button onClick={absorb} disabled={loading} style={{flexShrink:0,background:'none',border:'1px solid rgba(200,216,192,0.08)',borderRadius:3,padding:'0 16px',color:'rgba(200,216,192,0.35)',fontFamily:"'DM Mono',monospace",fontSize:7,letterSpacing:3,textTransform:'uppercase',cursor:loading?'default':'pointer',opacity:loading?0.3:1,transition:'all 0.2s',minHeight:42}}>
            {loading?'···':'absorber'}
          </button>
        </div>
      </div>
    </div>
  )
}
