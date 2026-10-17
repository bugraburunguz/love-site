import type { ThemeDef } from '../types'

const theme: ThemeDef = {
  id: 'seyahat',
  name: 'Seyahat',
  description: 'Eski bir seyahat günlüğü: atlas, pasaport damgaları ve pusula.',
  fonts: {
    display: '\'Cinzel\', Georgia, serif',
    hand: '\'Caveat\', \'Comic Sans MS\', cursive',
    // Cinzel is part of the base fonts already
    load: () => Promise.resolve(),
  },
  swatches: {
    light: { bg: '#F5E6CA', ink: '#4A3525', shadow: '#8A6A3A' },
    soft: { bg: '#EFE6D5', ink: '#4A3525', shadow: '#8A7A5A' },
    accent: { bg: '#B84E28', ink: '#FFF6E6', shadow: '#5A1E0A' },
    deep: { bg: '#556B1E', ink: '#FFFBEA', shadow: '#1E2A08' },
    dark: { bg: '#4A3525', ink: '#F5E6CA', shadow: '#140C06' },
  },
  papers: { plain: 'paper-plain.svg', lined: 'paper-lined.svg', textured: 'paper-textured.svg', special: 'paper-special.svg' },
  cover: { color: '#4A3525', ink: '#F1D680', ornament: 'cover-ornament.svg', stitch: '#C9A23A' },
  frameSkin: { paper: '#FBF3E2', edge: '#C9B48A', perforated: true },
  fasteners: ['fastener-masking.svg', 'fastener-clip.svg', 'fastener-tag.svg'],
  stickers: [
    { id: 'airmail-stamp', name: 'Hava postası damgası', file: 'airmail-stamp.svg' },
    { id: 'compass-rose', name: 'Pusula gülü', file: 'compass-rose.svg' },
    { id: 'boarding-pass', name: 'Uçak bileti', file: 'boarding-pass.svg' },
    { id: 'map-pin', name: 'Konum iğnesi', file: 'map-pin.svg' },
    { id: 'luggage-tag', name: 'Bavul etiketi', file: 'luggage-tag.svg' },
    { id: 'plane', name: 'Uçak', file: 'plane.svg' },
    { id: 'suitcase', name: 'Bavul', file: 'suitcase.svg' },
    { id: 'postcard', name: 'Kartpostal', file: 'postcard.svg' },
    { id: 'mountain-stamp', name: 'Dağ pulu', file: 'mountain-stamp.svg' },
    { id: 'mountain', name: 'Dağ', file: 'mountain.svg' },
    { id: 'palm', name: 'Palmiye', file: 'palm.svg' },
    { id: 'globe', name: 'Küre', file: 'globe.svg' },
  ],
  autoStickers: ['map-pin', 'plane', 'compass-rose'],
  mediaFilter: { sepia: 0.22, contrast: 1.04, saturate: 0.92, brightness: 1.0 },
  ambient: [
    { kind: 'paperPlanes', count: 3, speed: 0.9, colors: ['#F5E6CA', '#C85A32'], size: [16, 22] },
    { kind: 'clouds', count: 4, speed: 0.3, colors: ['#FFFFFF'], size: [40, 70] },
  ],
  hover: { glow: '#B8860B', compass: true },
  musicBox: { closed: 'musicbox-closed.svg', open: 'musicbox-open.svg' },
  accents: {
    blush: '#EBC7A8',
    blushLight: '#F6E3D0',
    rose: '#D9885F',
    roseDeep: '#B84E28',
    gold: '#B8860B',
    goldLight: '#E6C873',
    plus: '#B84E28',
    focus: '#B8860B',
  },
}

export default theme
