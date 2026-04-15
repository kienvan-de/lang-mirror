/**
 * Shared search utilities for SQL LIKE queries across services.
 */

const MAX_SEARCH_LENGTH = 200;

/** Sanitise user input into a SQL LIKE pattern with wildcards escaped. */
export function buildSearchPattern(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!trimmed) return null;
  return `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
}

/**
 * Build a SQL WHERE fragment that matches a LIKE pattern against one or more columns.
 *
 * @param columns  Column expressions to match, e.g. `["title"]` or `["t.title", "lv.title"]`
 * @returns `{ clause, params }` — splice into your query with `AND ${clause}` and spread `params`
 *
 * @example
 *   const { clause, params } = buildSearchClause(pattern, ["t.title"]);
 *   sql += ` AND ${clause}`;
 *   sqlParams.push(...params);
 *
 * @example With EXISTS subquery for version titles:
 *   const { clause, params } = buildSearchClauseWithVersions(pattern, "t.");
 *   sql += ` AND ${clause}`;
 *   sqlParams.push(...params);
 */
export function buildSearchClause(
  pattern: string,
  columns: string[],
): { clause: string; params: unknown[] } {
  const parts = columns.map(col => `${col} LIKE ? ESCAPE '\\'`);
  return {
    clause: parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`,
    params: columns.map(() => pattern),
  };
}

/**
 * Build a SQL WHERE fragment that matches a topic's base title OR any of its
 * version titles via an EXISTS subquery.
 *
 * @param pattern    The LIKE pattern from `buildSearchPattern()`
 * @param alias      Table alias for the topics table, e.g. `"t."` or `""` (no alias)
 *
 * @example
 *   const search = buildSearchPattern(query);
 *   if (search) {
 *     const { clause, params } = buildTopicSearchClause(search, "t.");
 *     sql += ` AND ${clause}`;
 *     sqlParams.push(...params);
 *   }
 */
export function buildTopicSearchClause(
  pattern: string,
  alias: string = "",
): { clause: string; params: unknown[] } {
  const clause =
    `(${alias}title LIKE ? ESCAPE '\\' OR EXISTS (` +
    `SELECT 1 FROM topic_language_versions lv ` +
    `WHERE lv.topic_id = ${alias}id AND lv.title LIKE ? ESCAPE '\\'` +
    `))`;
  return { clause, params: [pattern, pattern] };
}
