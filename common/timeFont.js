const digitPaths = (folder) => [
  `${folder}/0.png`,
  `${folder}/1.png`,
  `${folder}/2.png`,
  `${folder}/3.png`,
  `${folder}/4.png`,
  `${folder}/5.png`,
  `${folder}/6.png`,
  `${folder}/7.png`,
  `${folder}/8.png`,
  `${folder}/9.png`,
];

export const TIME_FONT_STYLE = "teko";

export const TIME_FONT_PRESETS = {
  teko: {
    digits: digitPaths("images/time/teko"),
    colon: "images/time/teko/colon.png",
  },
  blackOps: {
    digits: digitPaths("images/time/black-ops"),
    colon: "images/time/black-ops/colon.png",
  },
};

export const TIME_FONT = TIME_FONT_PRESETS[TIME_FONT_STYLE];
