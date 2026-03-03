import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json()
    if (!content?.trim()) return NextResponse.json({ error: 'Vide' }, { status: 400 })

    const parsed = {
      domain: 'INCONNU',
      fragments: ["J'absorbe...", "Je sens quelque chose."],
      connections: [],
      essence: content.slice(0, 60),
      label: content.split(' ').slice(0, 2).join(' '),
      richness: 0.5
    }

    await supabase.from('fragments').insert({
      content,
      domain: parsed.domain,
      label: parsed.label,
      essence: parsed.essence,
      richness: parsed.richness,
    })

    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
