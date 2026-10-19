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

/** Used for any DEVICE_ID that has no entry in DEVICE_SITES. */
export const DEFAULT_SITE: Site = {
  name: "Toronto, ON",
  latitude: 43.6532,
  longitude: -79.3832,
  timeZone: "America/Toronto",
};

/** Per-node locations, keyed by the DEVICE_ID set in /etc/sensor/uploader.env. */
export const DEVICE_SITES: Record<string, Site> = {
  "russell-node-01": { name: "Toronto, ON", latitude: 43.6532, longitude: -79.3832, timeZone: "America/Toronto" },
};

export function siteFor(deviceId: string): Site {
  return Object.hasOwn(DEVICE_SITES, deviceId) ? DEVICE_SITES[deviceId] : DEFAULT_SITE;
}
