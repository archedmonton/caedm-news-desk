import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_PATH: z.string().default("./data/caedm-news-desk.db"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_EMAIL_DOMAIN: z.string().default("caedm.ca"),
  DEV_LOGIN_ENABLED: bool,
  PRODUCTION_ACCESS_ENABLED: bool,
  EMAIL_TRANSPORT: z.enum(["outbox", "smtp", "graph"]).default("outbox"),
  EMAIL_LIVE_SEND: bool,
  EMAIL_FROM: z.string().default("CAEDM News Desk <newsdesk@caedm.ca>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  GRAPH_TENANT_ID: z.string().optional(),
  GRAPH_CLIENT_ID: z.string().optional(),
  GRAPH_CLIENT_SECRET: z.string().optional(),
  GRAPH_SENDER: z.string().optional(),
  /** Application developer: help & support contact, feature-request recipient, protected admin account. */
  DEVELOPER_NAME: z.string().default("Ruban Peppin"),
  DEVELOPER_EMAIL: z.string().email().default("ruban.peppin@caedm.ca"),
  FETCH_USER_AGENT: z
    .string()
    .default("CAEDM-NewsDesk/0.1 (+https://caedm.ca; communications monitoring; contact communications@caedm.ca)"),
  /** Test-only escape hatch so fixture servers on 127.0.0.1 can be fetched. Ignored in production. */
  FETCH_ALLOW_PRIVATE_HOSTS: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";

/** Test hook: re-read process.env. */
export function resetEnvCache() {
  cached = undefined;
}
