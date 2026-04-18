import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = path.resolve(process.cwd(), 'evals', 'eval_logs.jsonl');

export class EvalLogger {
  constructor({ logger }) {
    this.logger = logger;
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  }

  log(entry) {
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
    fs.appendFileSync(LOG_PATH, line, 'utf8');
    this.logger.info({ eval: entry }, 'Eval event logged');
  }

  scoreRelevance({ userText, assistantText }) {
    if (!userText || !assistantText) return 0;
    const userTokens = new Set(userText.toLowerCase().split(/\W+/).filter(Boolean));
    const assistantTokens = assistantText.toLowerCase().split(/\W+/).filter(Boolean);
    const overlap = assistantTokens.filter((token) => userTokens.has(token)).length;
    return Number((overlap / Math.max(userTokens.size, 1)).toFixed(2));
  }
}
