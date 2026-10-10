import { ensureDataDirs } from '../../config.ts';
import { runStartupPipeline } from './startupPipeline.ts';

async function main(): Promise<void> {
  console.log('[ManualImport] Full data pipeline (official exports → SQLite → enrichments).');
  ensureDataDirs();
  await runStartupPipeline({
    cliReport: true,
  });
}

main().catch((error: unknown) => {
  console.error('[ManualImport] Import pipeline failed:', error);
  process.exitCode = 1;
});
