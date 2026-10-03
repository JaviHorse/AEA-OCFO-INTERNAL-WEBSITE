/** Domain eligibility only; an active, exact-email membership is still required. */
export function emailDomainAllowed(email: string | undefined, primaryDomain: string): boolean {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return false;
  const domain = email.toLowerCase().split("@")[1];
  return domain === primaryDomain.toLowerCase().trim() || domain === "gmail.com";
}
