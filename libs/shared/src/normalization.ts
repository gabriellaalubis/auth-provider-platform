export function normalizeName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
