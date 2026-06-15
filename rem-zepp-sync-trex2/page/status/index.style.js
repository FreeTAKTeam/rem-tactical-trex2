export const COLORS = {
  background: 0x000000,
  green: 0x76d35d,
  white: 0xe5e5e5,
  dim: 0x8fa08c,
  orange: 0xff9f2e,
  red: 0xff4a32,
};

export const LAYOUT = {
  header: { x: 0, y: 18, w: 454, h: 42, size: 32 },
  rows: [
    { label: "CONNECTION", value: "connection", x: 32, y: 72, w: 390 },
    { label: "OPERATOR", value: "operator", x: 32, y: 118, w: 390 },
    { label: "OP STATE", value: "operatorStatus", x: 32, y: 164, w: 180 },
    { label: "TEAM", value: "teamStatus", x: 232, y: 164, w: 180 },
    { label: "EVENTS", value: "activeEvents", x: 32, y: 210, w: 180 },
    { label: "PRIORITY", value: "priority", x: 232, y: 210, w: 180 },
    { label: "LAST SYNC", value: "lastSyncAge", x: 32, y: 256, w: 390 },
    { label: "WAYPOINT", value: "waypoint", x: 32, y: 302, w: 390 },
  ],
  debug: { x: 28, y: 368, w: 398, h: 60, size: 14 },
};
