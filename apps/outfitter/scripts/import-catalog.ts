import { importCodexCatalog } from '../server/import/codexCatalog.ts';

const summary = importCodexCatalog();
console.log(JSON.stringify(summary, null, 2));
