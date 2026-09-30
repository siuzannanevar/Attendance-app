import postgres from "postgres";

const g = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

// prepare: false нужен при подключении через пулер (pooler)
export const sql =
  g.sql ?? postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

if (process.env.NODE_ENV !== "production") g.sql = sql;
