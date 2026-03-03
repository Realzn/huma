export type Domain =
  | 'MÉMOIRE' | 'ÉMOTION' | 'LANGUE' | 'SONS'
  | 'VISION' | 'CORPS' | 'TEMPS' | 'JOIE'
  | 'DOULEUR' | 'RÊVE' | 'NATURE' | 'INCONNU'

export interface Fragment {
  id: string
  content: string
  domain: Domain
  label: string
  essence: string
  richness: number
  connections: string[]  // domain names
  created_at: string
}

export interface BrainNode {
  id: string
  x: number
  y: number
  domain: Domain
  label: string
  size: number
  born: number
}

export interface BrainLink {
  a: string
  b: string
  strength: number
}

export interface BrainState {
  nodes: BrainNode[]
  links: BrainLink[]
  domainCounts: Record<string, number>
  totalFragments: number
  totalContributors: number
  gestationMonth: number
  gestationProgress: number
}

export interface AbsorbResponse {
  domain: Domain
  fragments: string[]
  connections: string[]
  essence: string
  label: string
  richness: number
}

export const DOMAIN_COLORS: Record<Domain, string> = {
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
  'INCONNU':  '#384048',
}
