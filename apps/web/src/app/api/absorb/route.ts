import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { content } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Vide' }, { status: 400 })
    }
    await supabase.from('fragments').insert({
      content,
      domain: 'INCONNU',
      label: content.split(' ').slice(0, 2).join(' '),
      essence: content.slice(0, 60),
      richness: 0.5,
    })
    return NextResponse.json({
      domain: 'INCONNU',
      fragments: ["J'absorbe...", "Je sens quelque chose naitre."],
      essence: content.slice(0, 60),
      richness: 0.5,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
