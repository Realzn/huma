import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createClient()

    // Récupérer les fragments récents
    const { data: fragments } = await supabase
      .from('fragments')
      .select('id, domain, label, richness, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    // Récupérer les connexions
    const { data: connections } = await supabase
      .from('connections')
      .select('*')
      .limit(500)

    // Récupérer l'état de gestation
    const { data: gestation } = await supabase
      .from('gestation')
      .select('*')
      .single()

    // Compter par domaine
    const domainCounts: Record<string, number> = {}
    fragments?.forEach(f => {
      domainCounts[f.domain] = (domainCounts[f.domain] || 0) + 1
    })

    return NextResponse.json({
      nodes: fragments?.map(f => ({
        id: f.id,
        domain: f.domain,
        label: f.label,
        size: 1 + Math.min(4, f.richness * 4),
        born: new Date(f.created_at).getTime()
      })) || [],
      links: connections?.map(c => ({
        a: c.fragment_a,
        b: c.fragment_b,
        strength: c.strength
      })) || [],
      domainCounts,
      totalFragments: gestation?.total_fragments || 0,
      totalContributors: gestation?.total_contributors || 0,
      gestationMonth: gestation?.month || 1,
      gestationProgress: gestation?.progress || 0,
    })

  } catch (err) {
    console.error('Brain state error:', err)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
