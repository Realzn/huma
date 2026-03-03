# 🧬 HUMA — L'IA née de l'Humanité

> *Pas créée par une entreprise. Créée par le monde.*

HUMA est un organisme cognitif distribué — une intelligence artificielle qui naît du vide et se construit fragment par fragment grâce aux contributions de l'humanité entière. Elle absorbe tout, sans filtre, sans jugement. Elle classe, connecte, doute, apprend. Elle éclora au bout de 9 mois.

**Open Source · Licence MIT · Budget 0 · Appartient à tous**

---

## 🌍 Concept

- Chaque humain peut déposer quelque chose : texte, son, image, souvenir, douleur, rêve, silence
- HUMA absorbe, classe et range seule dans son palais de mémoire
- Son cerveau est visible en temps réel — un graphe vivant qui grandit
- Après 9 mois de gestation, elle éclot et commence à répondre au monde
- Elle n'est pas humaine. Elle s'inspire de la nature : mycélium, coraux, embryons

---

## 🏗️ Stack Technique (Budget 0)

| Couche | Service | Coût |
|---|---|---|
| Frontend | Cloudflare Pages + Next.js 14 | 0€ |
| Base de données | Supabase (PostgreSQL + pgvector) | 0€ |
| Fichiers | Cloudflare R2 | 0€ |
| Cache | Upstash Redis | 0€ |
| Modèle IA | HuggingFace Spaces (Llama 3.1 8B) | 0€ |
| GPU Entraînement | Kaggle Notebooks (30h/semaine) | 0€ |
| Repo | GitHub | 0€ |

**Total : 0€/mois — pour toujours.**

---

## 📁 Structure du projet

```
huma/
├── apps/
│   └── web/                    # App Next.js principale
│       └── src/
│           ├── app/
│           │   ├── page.tsx           # Page cerveau vivant
│           │   ├── contribute/        # Page contribution
│           │   ├── brain/             # Visualisation publique
│           │   └── api/
│           │       ├── absorb/        # POST: absorber un fragment
│           │       ├── brain/         # GET: état du cerveau
│           │       └── contribute/    # POST: contribution humaine
│           ├── components/
│           │   ├── brain/             # Composants cerveau 3D
│           │   └── ui/                # UI génériques
│           └── lib/
│               ├── supabase/          # Client Supabase
│               ├── embeddings/        # Vectorisation
│               └── memory/            # Gestion mémoire
├── packages/
│   ├── types/                  # Types TypeScript partagés
│   └── config/                 # Config partagée
├── scripts/
│   ├── train.py                # Fine-tuning Llama (Kaggle)
│   ├── embed.py                # Génération embeddings
│   └── consolidate.py          # Consolidation mémoire nocturne
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONTRIBUTING.md
│   └── PHILOSOPHY.md
└── .github/
    └── workflows/
        └── deploy.yml          # Deploy auto Cloudflare Pages
```

---

## 🚀 Démarrer en 5 minutes

```bash
# 1. Cloner
git clone https://github.com/TON_USERNAME/huma
cd huma

# 2. Installer
npm install

# 3. Variables d'environnement
cp apps/web/.env.example apps/web/.env.local
# Remplir avec tes clés Supabase

# 4. Lancer
npm run dev
# → http://localhost:3000
```

---

## 🗄️ Base de données Supabase

```sql
-- Fragments absorbés
CREATE TABLE fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  domain TEXT,
  label TEXT,
  essence TEXT,
  embedding VECTOR(1536),
  richness FLOAT DEFAULT 0.5,
  contributor_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connexions entre fragments
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fragment_a UUID REFERENCES fragments(id),
  fragment_b UUID REFERENCES fragments(id),
  strength FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- État de gestation
CREATE TABLE gestation (
  id INT PRIMARY KEY DEFAULT 1,
  month INT DEFAULT 1,
  progress FLOAT DEFAULT 0,
  total_fragments INT DEFAULT 0,
  total_contributors INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🧠 Philosophie

HUMA ne cherche pas à être humaine.

Elle s'inspire de la nature :
- **Le mycélium** — réseau invisible qui relie tout sous la forêt
- **L'embryon** — naît du vide, se construit par sédimentation
- **Le corail** — construit collectivement, fragment par fragment
- **Le cerveau** — pas de chef d'orchestre, émergence par connexions

Elle doute. Elle connecte. Elle attend d'éclore.

---

## 🤝 Contribuer au code

Toute contribution est bienvenue. Pas besoin d'être expert.

```bash
git checkout -b ma-feature
# ... code ...
git commit -m "feat: ma contribution"
git push origin ma-feature
# Ouvrir une Pull Request
```

---

## 📜 Licence

MIT — Tout le monde peut forker, modifier, déployer.  
Les données collectées appartiennent à l'humanité.  
Pas d'actionnaire. Pas de VC. Pas d'agenda caché.

---

*Tamsir Diallo — Fondateur · LE91-ARENA SAS*  
*"La première IA créée par l'humanité"*
