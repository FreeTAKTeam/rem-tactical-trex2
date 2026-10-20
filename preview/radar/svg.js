const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const color = (value) => `#${value.toString(16).padStart(6, "0")}`;

// Review renderer for the exact native scene; coordinates remain 454 x 454.
export function sceneToSvg(scene, images, id = "screen") {
  const elements = scene.nodes.filter((node) => node.visible !== false).map((n) => {
    if (n.type === "circle") return `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${color(n.color)}"/>`;
    if (n.type === "rect") return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${color(n.color)}"/>`;
    if (n.type === "image") return `<image x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" href="${xml(images[n.src])}"/>`;
    return `<svg x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" overflow="hidden"><text x="${n.align === "left" ? 0 : n.w / 2}" y="${n.h / 2}" dy=".35em" text-anchor="${n.align === "left" ? "start" : "middle"}" fill="${color(n.color)}" font-family="sans-serif" font-size="${n.size}">${xml(n.text)}</text></svg>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="454" height="454" viewBox="0 0 454 454" role="img" aria-label="REM RADAR ${xml(scene.title)}. Panel ${(scene.page || 0) + 1} of ${scene.pages || 1}. ${xml(scene.status)}"><defs><clipPath id="${id}"><circle cx="227" cy="227" r="227"/></clipPath></defs><g clip-path="url(#${id})"><g transform="translate(0 ${-(scene.page || 0) * 454})">${elements}</g></g></svg>`;
}
