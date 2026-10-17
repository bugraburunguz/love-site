import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'buyulu',
  name: 'Büyülü',
  description: 'Eski deri ciltli bir büyü kitabı: parşömen, altın varak, yıldız tozu ve mum ışığı.',
  fonts: {
    display: '\'Cinzel Decorative\', \'Cinzel\', Georgia, serif',
    hand: '\'Caveat\', \'Comic Sans MS\', cursive',
    load: () =>
      Promise.all([
        import('@fontsource/cinzel-decorative/latin-700.css'),
        import('@fontsource/cinzel-decorative/latin-ext-700.css'),
      ]),
  },
  swatches: {
    light: { bg: '#F4E8C1', ink: '#3B2319', shadow: '#7A5A2A' },
    soft: { bg: '#E8D9A8', ink: '#3B2319', shadow: '#7A5A2A' },
    accent: { bg: '#2F5D50', ink: '#F4E8C1', shadow: '#0F2A22' },
    deep: { bg: '#7A1F2B', ink: '#F4E8C1', shadow: '#2A0810' },
    dark: { bg: '#1D2433', ink: '#E0A96D', shadow: '#05070C' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#3B2319', ink: '#E0A96D', ornament: 'cover-ornament.svg', stitch: '#E0A96D' },
  frameSkin: { paper: '#F3E6C4', edge: '#C9A44C', texture: 'paper-textured.svg' },
  fasteners: ['fastener-clip.svg', 'fastener-paper.svg', 'fastener-seal.svg'],
  stickers: [
    { id: 'winged-letter', name: 'Kanatlı mektup', file: 'winged-letter.svg' },
    { id: 'moon-star-seal', name: 'Ay-yıldız mührü', file: 'moon-star-seal.svg' },
    { id: 'star-shield', name: 'Yıldızlı kalkan süsü', file: 'star-shield.svg' },
    { id: 'star-cluster', name: 'Yıldız kümesi', file: 'star-cluster.svg' },
    { id: 'wand', name: 'Sihirli değnek', file: 'wand.svg' },
    { id: 'owl', name: 'Baykuş', file: 'owl.svg' },
    { id: 'quill-inkwell', name: 'Tüy kalem ve hokka', file: 'quill-inkwell.svg' },
    { id: 'potion', name: 'İksir şişesi', file: 'potion.svg' },
    { id: 'candle', name: 'Mum', file: 'candle.svg' },
    { id: 'crystal-ball', name: 'Kristal küre', file: 'crystal-ball.svg' },
    { id: 'old-key', name: 'Eski anahtar', file: 'old-key.svg' },
    { id: 'map-piece', name: 'Harita parçası', file: 'map-piece.svg' },
  ],
  autoStickers: ['star-cluster', 'wand', 'crystal-ball'],
  mediaFilter: { sepia: 0.2, contrast: 1.05, saturate: 0.9, brightness: 1.0 },
  ambient: [
    { kind: 'sparkles', count: 16, speed: 0.5, colors: ['#E0A96D', '#F4E8C1', '#FFF1C4'], size: [4, 9] },
  ],
  hover: { glow: '#E0A96D', burst: 'sparkles' },
  cursor: { file: 'cursor.svg', hotspot: [2, 2] },
  endNote: 'Büyü tamamlandı',
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#EBD9A6',
    blushLight: '#F6EBC8',
    rose: '#B88A4A',
    roseDeep: '#7A4A1C',
    gold: '#E0A96D',
    goldLight: '#F0CFA0',
    plus: '#7A1F2B',
    focus: '#E0A96D',
  },
}

export default theme
