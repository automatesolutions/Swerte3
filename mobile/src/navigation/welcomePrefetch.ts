import type { UserMe } from '../services/api';

/** Holds /me from Welcome → Profile so we don’t pass a large object in navigation params (breaks web URL linking). */
let stashedPrefetchedMe: UserMe | null = null;

export function stashWelcomePrefetch(me: UserMe): void {
  stashedPrefetchedMe = me;
}

/** Returns stashed user once and clears; safe to call when route params have no prefetchedMe. */
export function consumeWelcomePrefetch(): UserMe | null {
  const v = stashedPrefetchedMe;
  stashedPrefetchedMe = null;
  return v;
}
