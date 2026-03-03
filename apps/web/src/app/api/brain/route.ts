import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'



export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: fragments } = await supabase
      .from('fragments')
      .select('id, domain, label, richness, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

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
      domainCounts,
      totalFragments: fragments?.length || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
