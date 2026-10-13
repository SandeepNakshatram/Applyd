/** True when the recorded sync error means the user has to sign in with Google again. */
export function needsReconnect(error: string | null | undefined): boolean {
  return !!error && /reconnect/i.test(error);
}
