/**
 * Where to send the person once they are signed in, for example the page an
 * invitation email linked to. Only same-site paths are accepted, so the value
 * can never turn the login page into an open redirect.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}

export function withNext(path: string, next: string | null): string {
  if (!next) {
    return path;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}next=${encodeURIComponent(next)}`;
}
