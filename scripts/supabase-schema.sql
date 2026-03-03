-- ============================================
-- HUMA — Schema Supabase
-- Coller dans SQL Editor sur supabase.com
-- ============================================

-- Extension vectorielle (déjà activée sur Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── FRAGMENTS ──────────────────────────────
CREATE TABLE IF NOT EXISTS fragments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content      TEXT NOT NULL,
  domain       TEXT NOT NULL DEFAULT 'INCONNU',
  label        TEXT,
  essence      TEXT,
  embedding    VECTOR(1536),
  richness     FLOAT DEFAULT 0.5,
  contributor_id UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index vectoriel pour recherche sémantique
CREATE INDEX ON fragments USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ── CONNEXIONS ─────────────────────────────
CREATE TABLE IF NOT EXISTS connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fragment_a   UUID REFERENCES fragments(id) ON DELETE CASCADE,
  fragment_b   UUID REFERENCES fragments(id) ON DELETE CASCADE,
  strength     FLOAT DEFAULT 0.5,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fragment_a, fragment_b)
);

-- ── GESTATION ──────────────────────────────
CREATE TABLE IF NOT EXISTS gestation (
  id                  INT PRIMARY KEY DEFAULT 1,
  month               INT DEFAULT 1,
  progress            FLOAT DEFAULT 0,
  total_fragments     INT DEFAULT 0,
  total_contributors  INT DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer l'état initial
INSERT INTO gestation (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── FONCTION: incrémenter gestation ────────
CREATE OR REPLACE FUNCTION increment_gestation(richness FLOAT)
RETURNS void AS $$
BEGIN
  UPDATE gestation
  SET
    total_fragments = total_fragments + 1,
    progress = LEAST(9.0, progress + richness * 0.15),
    month = LEAST(9, FLOOR(LEAST(9.0, progress + richness * 0.15))::INT + 1),
    updated_at = NOW()
  WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- ── REALTIME ───────────────────────────────
-- Activer le realtime sur fragments (cerveau live)
ALTER PUBLICATION supabase_realtime ADD TABLE fragments;
ALTER PUBLICATION supabase_realtime ADD TABLE gestation;

-- ── RLS (Row Level Security) ───────────────
ALTER TABLE fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestation ENABLE ROW LEVEL SECURITY;

-- Lecture publique (tout le monde voit le cerveau)
CREATE POLICY "Lecture publique fragments" ON fragments
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique connexions" ON connections
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique gestation" ON gestation
  FOR SELECT USING (true);

-- Écriture avec service role seulement (via API)
CREATE POLICY "Insert via API" ON fragments
  FOR INSERT WITH CHECK (true);

-- ── VUE: stats domaines ────────────────────
CREATE OR REPLACE VIEW domain_stats AS
SELECT
  domain,
  COUNT(*) as count,
  AVG(richness) as avg_richness,
  MAX(created_at) as last_seen
FROM fragments
GROUP BY domain
ORDER BY count DESC;
