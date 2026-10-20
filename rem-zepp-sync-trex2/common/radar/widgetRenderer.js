const TYPES = { circle: "CIRCLE", text: "TEXT", rect: "FILL_RECT", image: "IMG" };
const FIELDS = ["type", "x", "y", "w", "h", "r", "color", "src", "text", "size", "align", "visible"];
const sameNode = (a, b) => a && FIELDS.every((key) => a[key] === b[key]);

// The legacy getter is documented as 1-based. Keep setter conversion here so
// firmware confirmation cannot affect navigation/state elsewhere.
export const fromNativePanel = (value) => Number.isFinite(value) ? Math.max(0, value - 1) : null;
export const toNativePanel = (value) => value + 1;

/** Lazy radar slots survive document visits; only one document pool is kept. */
export function createWidgetRenderer(ui, px, onTap, { resetOffset = () => {} } = {}) {
  const scale = px(1);
  const number = (n) => Math.round(n) * scale;
  const pools = new Map();
  let current = null;
  let documentKey = null;
  const properties = (node) => {
    if (node.type === "circle") return { center_x: number(node.x), center_y: number(node.y), radius: number(node.r), color: node.color };
    const box = { x: number(node.x), y: number(node.y), w: number(node.w), h: number(node.h) };
    if (node.type === "image") return { ...box, src: node.src };
    if (node.type === "rect") return { ...box, color: node.color };
    return { ...box, text: node.text, text_size: number(node.size), color: node.color,
      align_h: node.align === "left" ? ui.align.LEFT : ui.align.CENTER_H,
      align_v: ui.align.CENTER_V, text_style: ui.text_style.NONE };
  };
  function visible(pool, show) {
    if (pool.visible === show) return;
    pool.group.setProperty(ui.prop.VISIBLE, show);
    if (pool.touch) pool.touch.setProperty(ui.prop.VISIBLE, show);
    pool.visible = show;
  }
  function dispose(pool) {
    visible(pool, false);
    if (pool.touch) ui.deleteWidget(pool.touch);
    // Explicitly delete children before the group; no orphaned dial/text layer.
    for (const record of pool.widgets.values()) ui.deleteWidget(record.widget);
    ui.deleteWidget(pool.group);
    pools.delete(pool.key);
  }
  function configureScroll(pool) {
    resetOffset();
    if (typeof ui.setScrollView === "function") ui.setScrollView(pool.pages > 1, number(454), pool.pages, true);
    if (typeof ui.setLayerScrolling === "function") ui.setLayerScrolling(false);
  }
  function scroll(panel) {
    if (!current || current.pages <= 1) return;
    const next = Math.max(0, Math.min(current.pages - 1, panel));
    if (typeof ui.scrollToPage === "function") ui.scrollToPage(toNativePanel(next), false);
    current.requestedPanel = next;
  }
  function panel() {
    if (!current || current.pages <= 1) return 0;
    const native = typeof ui.getScrollCurrentPage === "function" ? fromNativePanel(ui.getScrollCurrentPage()) : null;
    return Math.min(current.pages - 1, native === null ? current.requestedPanel : native);
  }
  function render(scene) {
    const key = scene.hasRadar ? "radar" : scene.title;
    const changed = !current || current.key !== key;
    if (changed) {
      if (current) visible(current, false);
      if (key !== "radar" && documentKey && documentKey !== key) dispose(pools.get(documentKey));
      if (key !== "radar") documentKey = key;
      if (!pools.has(key)) {
        const pool = { key, pages: scene.pages || 1, requestedPanel: -1, frame: 0, visible: true,
          widgets: new Map(), touch: null, group: ui.createWidget(ui.widget.GROUP, { x: 0, y: 0, w: number(454), h: number(454 * (scene.pages || 1)) }) };
        pools.set(key, pool);
        visible(pool, false);
      }
      current = pools.get(key);
      configureScroll(current);
    }
    const frame = ++current.frame;
    for (const node of scene.nodes) {
      let record = current.widgets.get(node.id);
      if (!record && node.visible === false) continue;
      if (!record) {
        record = { widget: current.group.createWidget(ui.widget[TYPES[node.type]], properties(node)), node: { ...node }, visible: true };
        current.widgets.set(node.id, record);
      }
      record.frame = frame;
      const show = node.visible !== false;
      if (show && !sameNode(record.node, node)) record.widget.setProperty(ui.prop.MORE, properties(node));
      if (record.visible !== show) record.widget.setProperty(ui.prop.VISIBLE, show);
      record.visible = show;
      record.node = node;
    }
    for (const record of current.widgets.values()) if (record.frame !== frame && record.visible) {
      record.widget.setProperty(ui.prop.VISIBLE, false);
      record.visible = false;
    }
    if (scene.hasRadar && !current.touch) {
      const radarPool = current;
      current.touch = ui.createWidget(ui.widget.IMG, { x: 0, y: 0, w: number(454), h: number(454), src: "transparent-touch.png" });
      if (!current.visible) current.touch.setProperty(ui.prop.VISIBLE, false);
      current.touch.addEventListener(ui.event.CLICK_UP, (event) => {
        if (current !== radarPool || !radarPool.visible) return;
        if (event && Number.isFinite(event.x) && Number.isFinite(event.y)) onTap(event.x / scale, event.y / scale);
      });
    }
    if (current.pages > 1 && current.requestedPanel !== scene.page) scroll(scene.page || 0);
    visible(current, true);
  }
  function destroy() {
    for (const pool of [...pools.values()]) dispose(pool);
    current = null; documentKey = null;
    resetOffset();
    if (typeof ui.setScrollView === "function") ui.setScrollView(false, number(454), 1, true);
    if (typeof ui.setLayerScrolling === "function") ui.setLayerScrolling(false);
  }
  return { render, destroy, clear: destroy, panel, scroll };
}
