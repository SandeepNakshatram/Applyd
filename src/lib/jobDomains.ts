/**
 * One source of truth for "which sender domains are job infrastructure". These
 * lists used to be copied into four files and drifted: `greenhouse-mail.io`
 * (what Greenhouse confirmations actually come from) was in none of them, so
 * those mails were labelled source "Other".
 */

/** Applicant-tracking systems: they send on behalf of the employer. */
export const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "bamboohr.com",
  "ashbyhq.com",
  "jobvite.com",
  "successfactors.com",
  "taleo.net",
  "workable.com",
  "workablemail.com",
  "recruitee.com",
  "teamtailor.com",
  "breezy.hr",
  "pinpointhq.com",
];

/** Job boards: they say nothing about who the employer is. */
export const JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "naukri.com",
  "foundit.in",
  "monster.com",
  "indeed.com",
  "glassdoor.com",
  "shine.com",
  "timesjobs.com",
  "instahyre.com",
  "wellfound.com",
  "cutshort.io",
  "hirist.com",
];

export const MAIL_PROVIDER_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
];

/** True if `domain` is `base` or any subdomain of it (us.greenhouse-mail.io matches greenhouse-mail.io). */
export function domainMatches(domain: string, bases: readonly string[]): boolean {
  const d = domain.toLowerCase();
  return bases.some((base) => d === base || d.endsWith(`.${base}`));
}
