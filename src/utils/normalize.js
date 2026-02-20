/**
 * Normalize Clover API list responses (elements / data / raw array).
 */

function toList(raw) {
  if (Array.isArray(raw)) return raw;
  const elements = raw?.elements ?? raw?.data;
  return Array.isArray(elements) ? elements : [];
}

module.exports = { toList };
