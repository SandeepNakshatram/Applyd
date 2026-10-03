/**
 * Stored when an email establishes that an application exists but doesn't say
 * which company/role. Kept as real strings in the database (rather than null)
 * so matching can recognise and later fill them in; never shown raw to users.
 * No server-only imports here — client components use the display helpers too.
 */
export const UNKNOWN_COMPANY = "Unknown company";
export const UNKNOWN_ROLE = "Unknown role";

export function displayRole(role: string): string {
  return role === UNKNOWN_ROLE ? "Role not specified" : role;
}

export function displayCompany(company: string): string {
  return company === UNKNOWN_COMPANY ? "Company not identified" : company;
}

/** "Schrödinger — Software Developer", or just "Schrödinger" when the role is unknown. */
export function describeApplication(company: string, role: string): string {
  return role === UNKNOWN_ROLE ? displayCompany(company) : `${displayCompany(company)} — ${role}`;
}

export const isUnknownRole = (role: string) => role === UNKNOWN_ROLE;
export const isUnknownCompany = (company: string) => company === UNKNOWN_COMPANY;
