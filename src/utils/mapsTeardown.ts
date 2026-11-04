/** Errors thrown while Google Maps tears down after a referrer rejection. */
export function isIgnorableMapsTeardownError(message: string, filename = ""): boolean {
  const text = `${message}\n${filename}`;
  if (/RefererNotAllowed/i.test(text)) return true;
  const crashedOnUndefined =
    /undefined/i.test(message) && (/setAttribute/i.test(message) || /getRootNode/i.test(message));
  if (!crashedOnUndefined) return false;
  if (!filename) return true;
  return /maps\.(googleapis|gstatic)\.com|marker\.js/i.test(filename) || /@vis\.gl\/react-google-maps/.test(filename);
}

/** AdvancedMarkers throw if they are attached before the map has loaded or after auth failed. */
export function shouldAttachMapMarkers(input: {
  authFailed: boolean;
  apiLoaded: boolean;
  mapReady: boolean;
}): boolean {
  return input.apiLoaded && input.mapReady && !input.authFailed;
}
