/** Azione non consentita dalle regole. Il messaggio è pensato per il giocatore. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function assertRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
