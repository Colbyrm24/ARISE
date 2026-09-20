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

/** A dollar figure as a contract states it. */
export function formatAgreementMoney(amount: number) {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The terms an agreement is rendered from, wherever they came from.
 *
 * A paying client's terms live on their PaymentLink. A client moved across
 * from another platform has no payment link at all, so theirs live on the
 * invite that let them in. Same four levers either way — price, structure,
 * term, total — so the token map is written once, here, rather than once per
 * caller.
 *
 * That is not tidiness. These tokens ARE the contract: {{price}} and
 * {{total_value}} are the numbers somebody signs their name under. Two copies
 * of this map would eventually disagree about what a client agreed to, and
 * the only record of which one was right is prose inside a frozen
 * renderedText that nothing can add up.
 */
export type AgreementTerms = {
  clientName: string;
  coachName: string;
  price: number;
  paymentStructure: string;
  startDate: Date;
  termMonths: number;
  contractTotal: number | null;
};

/**
 * Renders a template body into the text a client will actually sign.
 *
 * `signed_date` is deliberately left as a literal placeholder: the sign
 * action fills it in, in the signer's own timezone, at the moment they sign.
 */
export function buildAgreementText(body: string, terms: AgreementTerms) {
  const formattedPrice = formatAgreementMoney(terms.price);

  return renderAgreementTemplate(body, {
    client_name: terms.clientName,
    coach_name: terms.coachName,
    price: formattedPrice,
    payment_structure: terms.paymentStructure,
    start_date: formatAgreementDate(terms.startDate),
    term_months: String(terms.termMonths),
    /*
      Falls back to the per-payment price when no total is set, which is right
      for the plans where one payment IS the whole thing: a template reading
      "the total value of this program is $2,400" stays true, rather than
      printing a raw {{total_value}} into a signed contract.
    */
    total_value: terms.contractTotal
      ? formatAgreementMoney(Number(terms.contractTotal))
      : formattedPrice,
  });
}
