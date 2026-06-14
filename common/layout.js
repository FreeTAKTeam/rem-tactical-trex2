export const SCREEN = {
  width: 454,
  height: 454,
};

export const LAYOUT = {
  header: {
    title: { x: 147, y: 10, w: 160, h: 38, size: 31 },
    status: { x: 126, y: 43, w: 202, h: 23, size: 15 },
  },
  heart: {
    label: { x: 52, y: 75, w: 145, h: 22, size: 15 },
    value: { x: 72, y: 97, w: 112, h: 48, size: 39 },
    unit: { x: 85, y: 132, w: 90, h: 18, size: 13 },
  },
  battery: {
    label: { x: 268, y: 75, w: 130, h: 22, size: 15 },
    value: { x: 270, y: 98, w: 118, h: 47, size: 38 },
  },
  clock: {
    digitWidth: 68,
    height: 108,
    hour: { x: 79, y: 153, w: 136, h: 108 },
    colon: { x: 215, y: 153, w: 24, h: 108 },
    minute: { x: 239, y: 153, w: 136, h: 108 },
  },
  gps: {
    label: { x: 43, y: 291, w: 120, h: 20, size: 14 },
    fix: { x: 62, y: 314, w: 100, h: 32, size: 24 },
    detail: { x: 67, y: 344, w: 92, h: 26, size: 20 },
  },
  heading: {
    label: { x: 167, y: 286, w: 120, h: 20, size: 14 },
    bearing: { x: 164, y: 306, w: 126, h: 35, size: 28 },
    north: { x: 218, y: 348, w: 18, h: 18, size: 13 },
  },
  operator: {
    label: { x: 302, y: 291, w: 112, h: 20, size: 14 },
    status: { x: 298, y: 314, w: 122, h: 29, size: 23 },
    teamLabel: { x: 305, y: 347, w: 108, h: 18, size: 12 },
    team: { x: 299, y: 364, w: 120, h: 27, size: 21 },
  },
  sync: {
    label: { x: 129, y: 412, w: 91, h: 18, size: 12 },
    value: { x: 218, y: 410, w: 92, h: 20, size: 14 },
    age: { x: 309, y: 412, w: 51, h: 18, size: 11 },
  },
};
