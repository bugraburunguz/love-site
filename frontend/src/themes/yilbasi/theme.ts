import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'yilbasi',
  name: 'Yılbaşı',
  description: 'Sıcak, şenlikli bir kış kulübesi: peri ışıkları, kar ve çam dalları.',
  fonts: {
    display: '\'Mountains of Christmas\', \'Georgia\', serif',
    headings: '\'Cinzel\', Georgia, serif',
    hand: '\'Caveat\', \'Comic Sans MS\', cursive',
    load: () =>
      Promise.all([
        import('@fontsource/mountains-of-christmas/latin-700.css'),
      ]),
  },
  swatches: {
    light: { bg: '#FAFAFA', ink: '#2B1B14', shadow: '#7A6A5A' },
    soft: { bg: '#F3E7D3', ink: '#2B1B14', shadow: '#8A7A5A' },
    accent: { bg: '#1E4620', ink: '#FAFAFA', shadow: '#06140A' },
    deep: { bg: '#8B0000', ink: '#FFF4E0', shadow: '#2A0000' },
    dark: { bg: '#14213D', ink: '#FFD700', shadow: '#04070F' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#8B0000', ink: '#FFE680', ornament: 'cover-ornament.svg', stitch: '#FFD700' },
  frameSkin: { paper: '#FFF8EC', edge: '#E3CFA8', corner: 'frame-corners.svg' },
  fasteners: ['fastener-stripes.svg', 'fastener-clip.svg', 'fastener-ribbon.svg'],
  stickers: [
    { id: 'gingerbread', name: 'Zencefilli kurabiye', file: 'gingerbread.svg' },
    { id: 'holly', name: 'Çobanpüskülü ve kozalak', file: 'holly.svg' },
    { id: 'bell', name: 'Altın çan', file: 'bell.svg' },
    { id: 'snowflake', name: 'Kar tanesi', file: 'snowflake.svg' },
    { id: 'merry-banner', name: 'Merry & Bright afişi', file: 'merry-banner.svg' },
    { id: 'pine-tree', name: 'Çam ağacı', file: 'pine-tree.svg' },
    { id: 'gift', name: 'Hediye kutusu', file: 'gift.svg' },
    { id: 'candy-cane', name: 'Şeker baston', file: 'candy-cane.svg' },
    { id: 'candle', name: 'Mum', file: 'candle.svg' },
    { id: 'mitten', name: 'Eldiven', file: 'mitten.svg' },
    { id: 'cocoa', name: 'Sıcak çikolata', file: 'cocoa.svg' },
    { id: 'star-ornament', name: 'Yıldız süsü', file: 'star-ornament.svg' },
  ],
  autoStickers: ['snowflake', 'star-ornament', 'bell'],
  mediaFilter: { sepia: 0.05, contrast: 1.04, saturate: 1.0, brightness: 1.02 },
  ambient: [
    { kind: 'snow', count: 18, speed: 0.8, colors: ['#FAFAFA'], size: [2, 5] },
    { kind: 'bokeh', count: 6, speed: 0.3, colors: ['#FFD700'], size: [18, 40] },
  ],
  hover: { glow: '#FFD700', burst: 'snow' },
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#F4B8BC',
    blushLight: '#FADADD',
    rose: '#D9606A',
    roseDeep: '#8B0000',
    gold: '#FFD700',
    goldLight: '#FFE866',
    plus: '#8B0000',
    focus: '#FFD700',
  },
}

export default theme
