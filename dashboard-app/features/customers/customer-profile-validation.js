const namePartPattern = /^\p{L}[\p{L}\p{M}]*(?:['’\-\u2010-\u2015]\p{L}[\p{L}\p{M}]*)*\.?$/u;

export function isValidFullName(value) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split(/\s+/);
  return parts.length >= 2 && parts.every((part) => namePartPattern.test(part));
}
