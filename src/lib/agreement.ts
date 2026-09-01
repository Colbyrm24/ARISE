/**
 * Fills a {{variable}} template with real values. Used once, right after a
 * payment succeeds, to produce the frozen renderedText an Agreement stores
 * forever — if the template is edited later, agreements already generated
 * are never affected, because they hold their own rendered copy, not a
 * reference back to the live template.
 */
export function renderAgreementTemplate(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
}

/**
 * A date as it will read on a contract, in the zone that makes it true.
 *
 * Defaults to UTC because most dates reaching here are `@db.Date` columns —
 * day labels stored at UTC midnight, already the right calendar day, and only
 * read back correctly in UTC. Anything that is a real INSTANT has to say
 * whose day it means.
 *
 * That distinction was missing, and it put the wrong date on signed
 * contracts. `signed_date` is the moment somebody hit sign, formatted with no
 * zone, and the host is UTC — so a client in Los Angeles signing at 6:30pm on
 * 1 September had "September 2, 2026" written into `Agreement.renderedText`,
 * which the schema calls a frozen snapshot and never re-renders. The
 * effective date on the contract was a day out, permanently, for every client
 * west of UTC who signed in the evening.
 */
export function formatAgreementDate(date: Date, timeZone: string = 'UTC') {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}
