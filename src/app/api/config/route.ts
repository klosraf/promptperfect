import { getConfig } from '@/lib/config';
import { DEFAULT_MODEL_IDS } from '@/lib/modelCatalog';

/**
 * Public capability map for clients (web UI, browser extension).
 * Booleans only — never leaks keys. Extra fields are additive;
 * old consumers reading `providers.gemini` keep working.
 */
export async function GET() {
  const config = getConfig();
  return Response.json({
    providers: {
      gemini: config.aiKeys.gemini !== null,
      openai: config.aiKeys.openai !== null,
      anthropic: config.aiKeys.anthropic !== null,
    },
    models: {
      gemini: config.geminiModel,
      openai: config.openaiModel,
      anthropic: DEFAULT_MODEL_IDS.anthropic,
    },
    unlimited: config.flags.unlimitedMode,
  });
}
