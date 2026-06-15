const MOCK_STATUSES = [
  {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    team: "ALPHA",
    teamStatus: "GREEN",
    lastSyncAge: "0s AGO",
    activeEvents: 0,
    priority: "NORMAL",
    alert: "NORMAL",
    mgrs: "11S LT 12345 67890",
    waypoint: "WP-23",
    waypointDistance: "1.2 km",
    waypointBearing: "328\u00b0",
  },
  {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    team: "ALPHA",
    teamStatus: "YELLOW",
    lastSyncAge: "15s AGO",
    activeEvents: 3,
    priority: "HIGH",
    alert: "NORMAL",
    mgrs: "11S LT 12345 67890",
    waypoint: "WP-23",
    waypointDistance: "1.2 km",
    waypointBearing: "328\u00b0",
  },
  {
    connection: "STALE",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    team: "ALPHA",
    teamStatus: "YELLOW",
    lastSyncAge: "3m AGO",
    activeEvents: 1,
    priority: "NORMAL",
    alert: "NORMAL",
    mgrs: "11S LT 12345 67890",
    waypoint: "WP-24",
    waypointDistance: "850 m",
    waypointBearing: "041\u00b0",
  },
  {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ALERT",
    team: "ALPHA",
    teamStatus: "RED",
    lastSyncAge: "5s AGO",
    activeEvents: 5,
    priority: "EMERGENCY",
    alert: "ALERT",
    mgrs: "11S LT 12345 67890",
    waypoint: "LZ-1",
    waypointDistance: "2.4 km",
    waypointBearing: "274\u00b0",
  },
  {
    connection: "ERROR",
    operator: "--",
    operatorStatus: "UNKNOWN",
    team: "UNKNOWN",
    teamStatus: "UNKNOWN",
    lastSyncAge: "--",
    activeEvents: 0,
    priority: "NORMAL",
    alert: "ERROR",
    mgrs: "",
    waypoint: "",
    waypointDistance: "--",
    waypointBearing: "--",
  },
  {
    connection: "CONNECTED",
    operator: "OP ALPHA-1",
    operatorStatus: "ACTIVE",
    team: "ALPHA",
    teamStatus: "GREEN",
    lastSyncAge: "8s AGO",
    activeEvents: 0,
    priority: "NORMAL",
    alert: "NORMAL",
    mgrs: "11S LT 12345 67890",
    waypoint: "",
    waypointDistance: "--",
    waypointBearing: "--",
  },
];

export function getMockRemStatus(index = 0, now = Date.now()) {
  const base = MOCK_STATUSES[((Number(index) || 0) % MOCK_STATUSES.length + MOCK_STATUSES.length) % MOCK_STATUSES.length];
  return {
    ...base,
    updatedAt: now,
  };
}

export function getNextMockRemStatus(index = 0, now = Date.now()) {
  return getMockRemStatus(index, now);
}

export function getMockStateCount() {
  return MOCK_STATUSES.length;
}
