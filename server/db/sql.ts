/**
 * Tiny helpers for the raw SQL this app runs against the main app's database
 * (queryMainDb). Replaces five hand-rolled copies of "push a param, return $n".
 */

/** Escape `%`, `_` and `\` so user input is matched literally inside LIKE/ILIKE. */
export const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');

export const pageOffset = (page: number, limit: number): number => (page - 1) * limit;

/**
 * Builds a parameterised WHERE clause.
 *
 *   const w = new SqlWhere('pay."isDeleted" = false');
 *   w.and('pay.status = ?::"PaymentStatus"', status);
 *   w.search(['o.name', 'cnt.email'], term);
 *   queryMainDb(`SELECT … FROM payments pay ${w.sql}`, w.params);
 *
 * Every `?` in a condition becomes the next `$n` placeholder, so values are never
 * interpolated into the SQL string.
 */
export class SqlWhere {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];

  constructor(...base: string[]) {
    this.parts.push(...base);
  }

  /** Bind a value and get its placeholder, for use inside a hand-built expression. */
  bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** Add a condition; each `?` is replaced by the next bound value. */
  and(condition: string, ...values: unknown[]): this {
    let i = 0;
    const sql = condition.replace(/\?/g, () => {
      if (i >= values.length) throw new Error(`SqlWhere: not enough values for "${condition}"`);
      return this.bind(values[i++]);
    });
    if (i !== values.length) throw new Error(`SqlWhere: too many values for "${condition}"`);
    this.parts.push(sql);
    return this;
  }

  /** Case-insensitive "contains" across several columns (literal match, wildcards escaped). */
  search(columns: string[], term: string, extraOr: string[] = []): this {
    const like = this.bind(`%${escapeLike(term)}%`);
    const ors = [...columns.map((c) => `${c} ILIKE ${like}`), ...extraOr];
    this.parts.push(`(${ors.join(' OR ')})`);
    return this;
  }

  /** `col LIKE 'prefix.%'` with the prefix matched literally (`feature_flag` ≠ `featureXflag`). */
  prefix(column: string, prefix: string): this {
    this.parts.push(`${column} LIKE ${this.bind(`${escapeLike(prefix)}.%`)}`);
    return this;
  }

  /** `WHERE a AND b`, or '' when there are no conditions. */
  get sql(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
}
