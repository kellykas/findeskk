/** Plain-language messages for reference-data writes. */
export function referenceErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("cannot change mobile money networks"))
    return "Only a super admin, company owner or general manager can change mobile money networks.";
  if (text.includes("cannot change currencies"))
    return "Your profile cannot change currencies. Ask an administrator to activate it, or check that you are not signed in as an auditor.";
  if (text.includes("deactivate it instead"))
    return "This is already used by a transaction, so it cannot be deleted. Switch it off instead — history stays intact.";
  if (text.includes("float account")) return "Choose an active float account for this wallet.";
  if (text.includes("short lowercase code"))
    return "Use 2–20 lowercase letters, digits or underscores for the code, e.g. mpesa.";
  if (text.includes("three letter currency"))
    return "Use a three letter currency code such as AED.";
  if (text.includes("give the network a name") || text.includes("give the currency a name"))
    return "Give it a name of at least 2 characters.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (
    text.includes("could not find the function") ||
    text.includes("schema cache") ||
    text.includes("does not exist")
  ) {
    return "Managing networks and currencies needs a one-time database setup. The steps are in docs/ADMIN-SETUP.md.";
  }
  return message;
}
