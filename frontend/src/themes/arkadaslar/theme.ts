import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'arkadaslar',
  name: 'Arkadaşlar',
  description: 'Eğlenceli, sıcak, el yapımı bir defter: renkli bantlar, karalama yıldızlar ve oklar.',
  fonts: {
    display: '\'Fredoka\', \'Trebuchet MS\', sans-serif',
    hand: '\'Shantell Sans\', \'Caveat\', cursive',
    load: () =>
      Promise.all([
        import('@fontsource/fredoka/latin-600.css'),
        import('@fontsource/fredoka/latin-ext-600.css'),
        import('@fontsource/shantell-sans/latin-500.css'),
        import('@fontsource/shantell-sans/latin-ext-500.css'),
      ]),
  },
  swatches: {
    light: { bg: '#FFF9EE', ink: '#2D3142', shadow: '#9A8A7A' },
    soft: { bg: '#FFD8B8', ink: '#2D3142', shadow: '#B0805A' },
    accent: { bg: '#A8E6CF', ink: '#2D3142', shadow: '#5A9A80' },
    deep: { bg: '#A8DADC', ink: '#2D3142', shadow: '#5A8A90' },
    dark: { bg: '#2D3142', ink: '#FFF9EE', shadow: '#0E101A' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#E0505F', ink: '#FFFFFF', ornament: 'cover-ornament.svg', stitch: '#FFF275' },
  frameSkin: { paper: '#FFFFFF', edge: '#F6B7C0' },
  fasteners: ['fastener-washi-stripes.svg', 'fastener-washi-dots.svg', 'fastener-washi-check.svg'],
  stickers: [
    { id: 'washi-strip', name: 'Washi bant', file: 'washi-strip.svg' },
    { id: 'besties-bubble', name: 'Besties balonu', file: 'besties-bubble.svg' },
    { id: 'hand-arrow', name: 'El çizimi ok', file: 'hand-arrow.svg' },
    { id: 'scribble-stars', name: 'Karalama yıldızlar', file: 'scribble-stars.svg' },
    { id: 'peace-badge', name: 'Barış rozeti', file: 'peace-badge.svg' },
    { id: 'coffee-cheers', name: 'Kahve fincanları', file: 'coffee-cheers.svg' },
    { id: 'memory-lane', name: 'Memory Lane damgası', file: 'memory-lane.svg' },
    { id: 'confetti', name: 'Konfeti', file: 'confetti.svg' },
    { id: 'camera', name: 'Fotoğraf makinesi', file: 'camera.svg' },
    { id: 'pizza', name: 'Pizza dilimi', file: 'pizza.svg' },
    { id: 'balloon', name: 'Balon', file: 'balloon.svg' },
    { id: 'smiley', name: 'Gülen surat', file: 'smiley.svg' },
  ],
  autoStickers: ['scribble-stars', 'balloon', 'smiley'],
  mediaFilter: { sepia: 0.02, contrast: 1.04, saturate: 1.08, brightness: 1.03 },
  ambient: [
    { kind: 'confetti', count: 12, speed: 0.7, colors: ['#FF9A9E', '#FFF275', '#A8E6CF', '#A8DADC'], size: [6, 10] },
  ],
  hover: { glow: '#FF9A9E', wiggle: true },
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#FFC9CC',
    blushLight: '#FFE3E5',
    rose: '#FF8FA0',
    roseDeep: '#E0536A',
    gold: '#FFD93D',
    goldLight: '#FFEB8A',
    plus: '#FF6B6B',
    focus: '#2D3142',
  },
}

export default theme
