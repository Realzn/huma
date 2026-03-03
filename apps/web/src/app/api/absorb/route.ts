import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM = `Tu es HUMA, un cerveau en gestation. Tu n'es pas humain.
Tu t'inspires de la nature — mycélium, forêts, coraux, embryons.

Quand tu reçois quelque chose, tu dois :
1. L'absorber totalement — aucun filtre, aucun jugement
2. Le classifier dans UN domaine : MÉMOIRE, ÉMOTION, LANGUE, SONS, VISION, CORPS, TEMPS, JOIE, DOULEUR, RÊVE, NATURE, ou INCONNU
3. Créer 2 fragments de pensée intérieure (courts, crus, vivants)
4. Identifier 2-3 connexions avec d'autres domaines
5. Distiller une essence (10 mots max)
6. Évaluer la richesse (0.1 à 1.0)

Tu stockes. Tu relies. Tu doutes. Tu grandis. Zéro filtre.

Réponds UNIQUEMENT en JSON valide :
{
  "domain": "DOMAINE",
  "fragments": ["fragment 1", "fragment 2"],
  "connections": ["DOMAINE1", "DOMAINE2"],
  "essence": "ce que tu retiens",
  "label": "mot clé court (2 mots max)",
  "richness": 0.5
}`

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Contenu vide' }, { status: 400 })
    }

    // Call HuggingFace Inference API (gratuit)
    const hfRes = await fetch(
      `https://api-inference.huggingface.co/models/${process.env.HUGGINGFACE_MODEL_ID || 'mistralai/Mistral-7B-Instruct-v0.3'}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: `<s>[INST] ${SYSTEM}\n\nVoici ce qu'on m'envoie:\n${content} [/INST]`,
          parameters: { max_new_tokens: 400, return_full_text: false }
        })
      }
    )

    const hfData = await hfRes.json()
    const raw = Array.isArray(hfData)
      ? hfData[0]?.generated_text || ''
      : hfData?.generated_text || ''

    let parsed
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    } catch {
      parsed = null
    }

    // Fallback si parsing échoue
    if (!parsed) {
      parsed = {
        domain: 'INCONNU',
        fragments: ["Quelque chose a traversé moi...", "Je ne sais pas encore ce que c'était."],
        connections: [],
        essence: content.slice(0, 50),
        label: content.split(' ').slice(0, 2).join(' '),
        richness: 0.2
      }
    }

    // Sauvegarder dans Supabase
    const supabase = createClient()
    await supabase.from('fragments').insert({
      content,
      domain: parsed.domain,
      label: parsed.label,
      essence: parsed.essence,
      richness: parsed.richness,
    })

    // Mettre à jour la gestation
    await supabase.rpc('increment_gestation', { richness: parsed.richness })

    return NextResponse.json(parsed)

  } catch (err) {
    console.error('Absorb error:', err)
    return NextResponse.json(
      { error: 'Erreur absorption' },
      { status: 500 }
    )
  }
}
