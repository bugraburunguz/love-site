import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'cadilar-bayrami',
  name: 'Cadılar Bayramı',
  description: 'Sıcak ürkütücü, sevimli bir sonbahar defteri: balkabakları, mum ışığı ve yarasalar.',
  fonts: {
    display: '\'Creepster\', \'Georgia\', serif',
    headings: '\'Cinzel\', Georgia, serif',
    hand: '\'Caveat\', \'Comic Sans MS\', cursive',
    load: () =>
      Promise.all([
        import('@fontsource/creepster/latin-400.css'),
      ]),
  },
  swatches: {
    light: { bg: '#F1E4C8', ink: '#2A1A12', shadow: '#7A5A3A' },
    soft: { bg: '#FFB300', ink: '#1A1A1A', shadow: '#8A5A00' },
    accent: { bg: '#E65100', ink: '#120A06', shadow: '#6A2400' },
    deep: { bg: '#4A148C', ink: '#FFE9C4', shadow: '#14052A' },
    dark: { bg: '#1A1A1A', ink: '#FFB300', shadow: '#000000' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#2A1346', ink: '#FFB300', ornament: 'cover-ornament.svg', stitch: '#E65100' },
  frameSkin: { paper: '#F2E4C6', edge: '#8A6A3A' },
  fasteners: ['fastener-stripes.svg', 'fastener-bat.svg', 'fastener-web.svg'],
  stickers: [
    { id: 'pumpkin', name: 'Balkabağı', file: 'pumpkin.svg' },
    { id: 'ghost', name: 'Hayalet', file: 'ghost.svg' },
    { id: 'bat-clip', name: 'Yarasa klips', file: 'bat-clip.svg' },
    { id: 'cobweb-corner', name: 'Örümcek ağı köşesi', file: 'cobweb-corner.svg' },
    { id: 'witch-hat', name: 'Cadı şapkası rozeti', file: 'witch-hat.svg' },
    { id: 'candle', name: 'Mum', file: 'candle.svg' },
    { id: 'full-moon', name: 'Dolunay', file: 'full-moon.svg' },
    { id: 'autumn-leaf', name: 'Sonbahar yaprağı', file: 'autumn-leaf.svg' },
    { id: 'candy', name: 'Şeker', file: 'candy.svg' },
    { id: 'black-cat', name: 'Kara kedi', file: 'black-cat.svg' },
    { id: 'spider', name: 'Örümcek', file: 'spider.svg' },
    { id: 'candy-corn', name: 'Mısır şekeri', file: 'candy-corn.svg' },
  ],
  autoStickers: ['autumn-leaf', 'candy-corn', 'full-moon'],
  mediaFilter: { sepia: 0.0, contrast: 1.1, saturate: 0.88, brightness: 0.97 },
  ambient: [
    { kind: 'leaves', count: 10, speed: 0.7, colors: ['#E65100', '#FFB300', '#B3200A'], size: [12, 18] },
    { kind: 'bats', count: 2, speed: 1.3, colors: ['#1A1A1A'], size: [20, 26] },
  ],
  hover: { glow: '#FFB300', burst: 'bats' },
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#FFC896',
    blushLight: '#FFE2C4',
    rose: '#E67A2E',
    roseDeep: '#B34000',
    gold: '#FFB300',
    goldLight: '#FFD166',
    plus: '#4A148C',
    focus: '#FFB300',
  },
}

export default theme
