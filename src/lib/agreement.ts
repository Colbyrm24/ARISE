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

export function formatAgreementDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
