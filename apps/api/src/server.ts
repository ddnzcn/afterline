import { buildApp } from "./app";
import { JobStore } from "./jobs";
import { AnalysisPool } from "./pool";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

// ANALYSIS_WORKERS caps the pool (each worker is a separate Node process); default: CPU cores - 1
const workers = Number.parseInt(process.env.ANALYSIS_WORKERS ?? "", 10);
const pool = new AnalysisPool(Number.isInteger(workers) && workers > 0 ? workers : undefined);
const app = buildApp(new JobStore(pool));

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

app.listen({ port, host }).then(() => app.log.info(`analysis pool: ${pool.size} workers`));
