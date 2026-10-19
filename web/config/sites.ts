// Where each sensor node is installed. The node only sends its DEVICE_ID, so the
// location used for weather (and the time zone used for display) is looked up here.

export type Site = {
  /** Shown in the dashboard header. */
  name: string;
  latitude: number;
  longitude: number;
  /** IANA zone name; every time on the dashboard is shown in this zone. */
  timeZone: string;
};

/** Used for any DEVICE_ID that has no entry in DEVICE_SITES. Replace with your node's location. */
export const DEFAULT_SITE: Site = {
  name: "Woods Hole, MA",
  latitude: 41.5265,
  longitude: -70.6731,
  timeZone: "America/New_York",
};

/** Per-node locations, keyed by the DEVICE_ID set in /etc/sensor/uploader.env. */
export const DEVICE_SITES: Record<string, Site> = {
  // "marine-node-01": { name: "Harbour pontoon", latitude: 50.3655, longitude: -4.1425, timeZone: "Europe/London" },
};

export function siteFor(deviceId: string): Site {
  return Object.hasOwn(DEVICE_SITES, deviceId) ? DEVICE_SITES[deviceId] : DEFAULT_SITE;
}
