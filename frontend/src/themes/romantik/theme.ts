import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'romantik',
  name: 'Romantik',
  description: 'Dantel ciltli bir aşk defteri: mum ışığı, kurutulmuş güller ve balmumu mühür.',
  fonts: {
    display: '\'Playfair Display\', Georgia, \'Times New Roman\', serif',
    hand: '\'Caveat\', \'Comic Sans MS\', cursive',
    load: () =>
      Promise.all([
        import('@fontsource/playfair-display/latin-600.css'),
        import('@fontsource/playfair-display/latin-ext-600.css'),
      ]),
  },
  swatches: {
    light: { bg: '#FBF3E6', ink: '#4A2E2B', shadow: '#8A5A4A' },
    soft: { bg: '#F7DDDD', ink: '#4A2E2B', shadow: '#A06A6A' },
    accent: { bg: '#D8A7B1', ink: '#2E1618', shadow: '#8A4A5A' },
    deep: { bg: '#EBD3A3', ink: '#4A2E2B', shadow: '#9A7A3A' },
    dark: { bg: '#3B1F24', ink: '#F6E3C8', shadow: '#12060A' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#B7788A', ink: '#FFF3DC', ornament: 'cover-ornament.svg', stitch: '#F5DFA8' },
  frameSkin: { paper: '#FFF9F2', edge: '#E8D6C0', corner: 'frame-corners.svg' },
  fasteners: ['fastener-ribbon.svg', 'fastener-clip.svg', 'fastener-tape.svg'],
  stickers: [
    { id: 'wax-seal', name: 'Balmumu mühür', file: 'wax-seal.svg' },
    { id: 'pressed-rose', name: 'Preslenmiş gül', file: 'pressed-rose.svg' },
    { id: 'gypsophila', name: 'Cipsofil dalı', file: 'gypsophila.svg' },
    { id: 'satin-ribbon', name: 'Saten kurdele', file: 'satin-ribbon.svg' },
    { id: 'forever-note', name: 'Forever notu', file: 'forever-note.svg' },
    { id: 'candle-glow', name: 'Mum ışığı', file: 'candle-glow.svg' },
    { id: 'heart', name: 'Kalp', file: 'heart.svg' },
    { id: 'sealed-envelope', name: 'Mühürlü zarf', file: 'sealed-envelope.svg' },
    { id: 'butterfly', name: 'Kelebek', file: 'butterfly.svg' },
    { id: 'daisy', name: 'Papatya', file: 'daisy.svg' },
    { id: 'infinity', name: 'Sonsuzluk', file: 'infinity.svg' },
    { id: 'love-stamp', name: 'Aşk pulu', file: 'love-stamp.svg' },
  ],
  autoStickers: ['heart', 'butterfly', 'daisy', 'infinity'],
  mediaFilter: { sepia: 0.12, contrast: 1.03, saturate: 0.95, brightness: 1.02 },
  ambient: [
    { kind: 'petals', count: 7, speed: 0.8, colors: ['#F4C2C2', '#D8A7B1', '#E8A0AE'], size: [10, 16] },
    { kind: 'hearts', count: 4, speed: 0.7, colors: ['#E8A0AE', '#F4C2C2'], size: [8, 12] },
  ],
  hover: { glow: '#F4C58A', burst: 'petals' },
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#F4C2C2',
    blushLight: '#FBDADA',
    rose: '#D8A7B1',
    roseDeep: '#A65F70',
    gold: '#E5C158',
    goldLight: '#F0DA94',
    plus: '#B8505F',
    focus: '#E5C158',
  },
}

export default theme
