/** Errors thrown while Google Maps tears down after a referrer rejection. */
export function isIgnorableMapsTeardownError(message: string, filename = ""): boolean {
  const text = `${message}\n${filename}`;
  if (/RefererNotAllowed/i.test(text)) return true;
  const setAttributeOnUndefined = /undefined/i.test(message) && /setAttribute/i.test(message);
  if (!setAttributeOnUndefined) return false;
  if (!filename) return true;
  return /maps\.(googleapis|gstatic)\.com/i.test(filename) || /@vis\.gl\/react-google-maps/.test(filename);
}
