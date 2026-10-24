import { z } from 'zod';

const runtimeConfigSchema = z.object({
  apiBaseUrl: z.string().min(1),
  docsUrl: z.string(),
  grafanaUrl: z.string(),
});

type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const parseRuntimeConfig = (raw: unknown): RuntimeConfig => runtimeConfigSchema.parse(raw);

export const runtimeConfig: RuntimeConfig = parseRuntimeConfig(window.__APP_CONFIG__);
