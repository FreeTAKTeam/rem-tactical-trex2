// Conservative display units keep wide capitals, CJK and emoji in safe bounds.
const units = (char) => {
  const point = char.codePointAt(0);
  if (point >= 0x300 && point <= 0x36f || point >= 0xfe00 && point <= 0xfe0f) return 0;
  if (point > 0x7f || /[MWmw@%&#<>~=+^]/.test(char)) return 2;
  if (/[A-Z]/.test(char)) return 1.4;
  return char === " " ? 0.6 : 1.25;
};

export function labelLines(value, limit = 20) {
  const lines = [];
  let line = "", width = 0;
  for (const char of Array.from(String(value))) {
    const size = units(char);
    if (line && width + size > limit) {
      lines.push(line.trim()); line = ""; width = 0;
    }
    if (!line && char === " ") continue;
    line += char; width += size;
  }
  if (line) lines.push(line.trim());
  return lines.length ? lines : ["—"];
}

export function labelPreview(value, limit = 18) {
  const lines = labelLines(value, limit);
  return lines.length > 1 ? labelLines(value, Math.max(2, limit - units("…")))[0] + "…" : lines[0];
}
