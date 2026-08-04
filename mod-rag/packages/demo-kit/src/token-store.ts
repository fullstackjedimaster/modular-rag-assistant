let embedToken = "";
const listeners = new Set<() => void>();

export function getEmbedToken(): string {
  return embedToken;
}

export function setEmbedToken(token: string): void {
  if (embedToken === token) return;
  embedToken = token;
  for (const listener of listeners) listener();
}

export function subscribeEmbedToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
