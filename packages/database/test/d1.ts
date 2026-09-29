import { DatabaseSync } from "node:sqlite";

type BatchMode = "direct" | "transactional" | "serialized";
type BatchStatementMethod = "all" | "run";

type TestD1Options = {
  foreignKeys?: boolean;
  batchMode?: BatchMode;
  batchStatementMethod?: BatchStatementMethod;
  reportWriteChangesInAll?: boolean;
  countStatements?: boolean;
  execReturnsD1Result?: boolean;
  failBatchNumbers?: number[];
};

export const createTestD1 = ({
  foreignKeys = false,
  batchMode = "direct",
  batchStatementMethod = "all",
  reportWriteChangesInAll = false,
  countStatements = false,
  execReturnsD1Result = false,
  failBatchNumbers = [],
}: TestD1Options = {}) => {
  const sqlite = new DatabaseSync(":memory:");
  if (foreignKeys) sqlite.exec("PRAGMA foreign_keys = ON;");
  let statementCount = 0;
  let batchNumber = 0;
  let batchTail = Promise.resolve();
  const countStatement = () => {
    if (countStatements) statementCount += 1;
  };
  const metadata = (changes: number, rowsRead = 0, lastRowId = 0) => ({
    changes,
    duration: 0,
    size_after: 0,
    rows_read: rowsRead,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
  });
  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() {
        countStatement();
        return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null;
      },
      async all<T>() {
        countStatement();
        const results = sqlite.prepare(sql).all(...bound) as T[];
        const changes = reportWriteChangesInAll && isWrite
          ? Number((sqlite.prepare("SELECT changes() AS changes").get() as { changes: number }).changes)
          : 0;
        return { results, success: true, meta: metadata(changes, results.length) };
      },
      async run() {
        countStatement();
        const result = sqlite.prepare(sql).run(...bound);
        const changes = Number(result.changes ?? 0);
        return { success: true, meta: metadata(changes, 0, Number(result.lastInsertRowid ?? 0)) };
      },
      async raw<T extends unknown[] = unknown[]>() {
        countStatement();
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };
  const applyBatch = async (statements: Array<ReturnType<typeof wrapStatement>>) => {
    if (batchMode !== "direct") sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement[batchStatementMethod]());
      if (batchMode !== "direct") sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      if (batchMode !== "direct") sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  const database = {
    prepare(sql: string) { return wrapStatement(sql); },
    batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      batchNumber += 1;
      if (failBatchNumbers.includes(batchNumber)) return Promise.reject(new Error("D1_TRANSIENT_FAILURE"));
      if (batchMode !== "serialized") return applyBatch(statements);
      const batch = batchTail.then(() => applyBatch(statements), () => applyBatch(statements));
      batchTail = batch.then(() => undefined, () => undefined);
      return batch;
    },
    async exec(sql: string) {
      countStatement();
      sqlite.exec(sql);
      return execReturnsD1Result ? [{ results: [], success: true, meta: metadata(0) }] : [];
    },
    withSession() { return database; },
  } as unknown as D1Database;
  return {
    database,
    sqlite,
    resetCount: () => { statementCount = 0; },
    getCount: () => statementCount,
  };
};
