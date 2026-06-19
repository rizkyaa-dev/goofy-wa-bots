import { z } from 'zod';

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : undefined;
  }, schema.optional());

const deepSeekReasoningEffort = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized === 'low' || normalized === 'medium') {
    return 'high';
  }

  if (normalized === 'xhigh') {
    return 'max';
  }

  return normalized;
}, z.enum(['high', 'max']).optional());

const thinkingType = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (['enabled', 'true', '1', 'yes', 'on'].includes(normalized)) {
    return 'enabled';
  }

  if (['disabled', 'false', '0', 'no', 'off'].includes(normalized)) {
    return 'disabled';
  }

  return normalized;
}, z.enum(['enabled', 'disabled']).default('enabled'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DASHBOARD_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  DASHBOARD_PORT: z
    .string()
    .default('3000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  WHATSAPP_CLIENT_ID: z.string().min(1).default('personal'),
  WHATSAPP_DATA_PATH: z.string().min(1).default('.wwebjs_auth'),
  WHATSAPP_HEADLESS: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  WHATSAPP_BROWSER_PATH: z.string().optional().default(''),
  WHATSAPP_SESSION_RM_MAX_RETRIES: z
    .string()
    .default('20')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  WHATSAPP_TYPING_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  WHATSAPP_TYPING_MIN_MS: z
    .string()
    .default('900')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(0)),
  WHATSAPP_TYPING_MAX_MS: z
    .string()
    .default('6500')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  WHATSAPP_TYPING_CHARS_PER_SECOND: z
    .string()
    .default('22')
    .transform((value) => Number(value))
    .pipe(z.number().positive()),
  BOT_OWNER_NUMBER: z.string().optional().default(''),
  BOT_ALLOWED_NUMBERS: z.string().optional().default(''),
  BOT_DEFAULT_MODE: z.enum(['command_only', 'auto_reply', 'silent']).default('command_only'),
  BOT_REPLY_BATCHING_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  BOT_REPLY_MIN_QUIET_MS: z
    .string()
    .default('2800')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(0)),
  BOT_REPLY_FRAGMENT_QUIET_MS: z
    .string()
    .default('8000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  BOT_REPLY_LONG_TEXT_QUIET_MS: z
    .string()
    .default('12000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  BOT_REPLY_MAX_WAIT_MS: z
    .string()
    .default('25000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  BOT_REPLY_BATCH_MAX_MESSAGES: z
    .string()
    .default('8')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  TEMP_HAI_REPLY_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  LLM_PROVIDER: z.string().min(1),
  LLM_MAX_TOKENS: z
    .string()
    .default('1200')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com'),
  GEMINI_MODEL: z.string().min(1),
  GEMINI_TEMPERATURE: optionalNumber(z.number().min(0).max(2)),
  GEMINI_TOP_P: optionalNumber(z.number().min(0).max(1)),
  GEMINI_MAX_TOKENS: optionalNumber(z.number().int().positive()),
  WEB_SEARCH_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() !== 'false'),
  WEB_SEARCH_PROVIDER: z.string().min(1).default('gemini'),
  WEB_SEARCH_MODEL: z.string().optional().default(''),
  WEB_SEARCH_TIMEOUT_MS: z
    .string()
    .default('7000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  WEB_SEARCH_MAX_SOURCES: z
    .string()
    .default('5')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(10)),
  WEB_SEARCH_CACHE_TTL_SECONDS: z
    .string()
    .default('120')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(0).max(3600)),
  WEB_SEARCH_MIN_CONFIDENCE: z
    .string()
    .default('0.72')
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(1)),
  WEB_SEARCH_REQUIRE_SOURCES_FOR_CRITICAL: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_SEARCH_INTENT_CLASSIFIER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_SEARCH_INTENT_CLASSIFIER_PROVIDER: z.string().min(1).default('deepseek'),
  ROLEPLAY_SEARCH_INTENT_CLASSIFIER_MODEL: z.string().optional().default(''),
  ROLEPLAY_SEARCH_INTENT_CLASSIFIER_MIN_CONFIDENCE: z
    .string()
    .default('0.72')
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(1)),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_TEMPERATURE: optionalNumber(z.number().min(0).max(2)),
  OPENAI_TOP_P: optionalNumber(z.number().min(0).max(1)),
  OPENAI_MAX_TOKENS: optionalNumber(z.number().int().positive()),
  OPENAI_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('high'),
  DEEPSEEK_API_KEY: z.string().optional().default(''),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().min(1),
  DEEPSEEK_TEMPERATURE: optionalNumber(z.number().min(0).max(2)),
  DEEPSEEK_TOP_P: optionalNumber(z.number().min(0).max(1)),
  DEEPSEEK_MAX_TOKENS: optionalNumber(z.number().int().positive()),
  DEEPSEEK_REASONING_EFFORT: deepSeekReasoningEffort,
  DEEPSEEK_THINKING_TYPE: thinkingType,
  ROLEPLAY_CHARACTER_NAME: z.string().min(1).default('Alya'),
  ROLEPLAY_CHARACTER_PROFILE: z
    .string()
    .min(1)
    .default('Karakter fiksi untuk ngobrol santai di WhatsApp. Hangat, responsif, dan punya rasa ingin tahu.'),
  ROLEPLAY_RECENT_MESSAGE_LIMIT: z
    .string()
    .default('14')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  ROLEPLAY_MEMORY_LIMIT: z
    .string()
    .default('8')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  ROLEPLAY_QUOTE_ENGINE_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_QUOTE_CANDIDATE_LIMIT: z
    .string()
    .default('40')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  ROLEPLAY_QUOTE_MIN_CONFIDENCE: z
    .string()
    .default('0.74')
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(1)),
  ROLEPLAY_QUOTE_PROVIDER: z.string().min(1),
  ROLEPLAY_QUOTE_MODEL: z.string().min(1),
  ROLEPLAY_ROUTER_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_ROUTER_PROVIDER: z.string().min(1),
  ROLEPLAY_ROUTER_MODEL: z.string().min(1),
  ROLEPLAY_ROUTER_MIN_CONFIDENCE: z
    .string()
    .default('0.58')
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(1)),
  ROLEPLAY_DEBUG_LOG_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_MULTI_BUBBLE_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_MULTI_BUBBLE_MAX_PARTS: z
    .string()
    .default('3')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(3)),
  ROLEPLAY_EMOTION_CLASSIFIER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER: z.string().min(1),
  ROLEPLAY_EMOTION_CLASSIFIER_MODEL: z.string().optional().default(''),
  ROLEPLAY_MEMORY_EXTRACTOR_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER: z.string().min(1),
  ROLEPLAY_MEMORY_EXTRACTOR_MODEL: z.string().min(1),
  ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE: z
    .string()
    .default('0.65')
    .transform((value) => Number(value))
    .pipe(z.number().min(0).max(1)),
  ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES: z
    .string()
    .default('3')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  ROLEPLAY_PRESENCE_AGENT_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  ROLEPLAY_PRESENCE_AGENT_PROVIDER: z.string().optional().default(''),
  ROLEPLAY_PRESENCE_AGENT_MODEL: z.string().optional().default(''),
  ROLEPLAY_PRESENCE_AGENT_TEMPERATURE: optionalNumber(z.number().min(0).max(2)),
  ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS: z
    .string()
    .default('700')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS: z
    .string()
    .default('6000')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  PROACTIVE_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
  PROACTIVE_CHECK_INTERVAL_MINS: z
    .string()
    .default('15')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
  PROACTIVE_INACTIVITY_HOURS: z
    .string()
    .default('24')
    .transform((value) => Number(value))
    .pipe(z.number().int().positive()),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }

  return parsed.data;
}
