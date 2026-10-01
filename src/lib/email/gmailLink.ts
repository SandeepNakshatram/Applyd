/**
 * A direct link to a message in the Gmail web UI, for "verify from the
 * original email" actions (spec section 15's review queue). Deep-links by
 * Gmail message ID into "All Mail" so it works regardless of which
 * label/folder the message is actually in. `u/0` assumes the account is the
 * viewer's first-signed-in Google account in that browser — true for the
 * common single-account case; a user signed into multiple Google accounts
 * may need to switch accounts after the link opens.
 */
export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}
