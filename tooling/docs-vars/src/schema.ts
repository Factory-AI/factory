import { z } from 'zod';

const PlansSchema = z
  .object({
    Pro: z.string().min(1),
    Plus: z.string().min(1),
    Max: z.string().min(1),
    Enterprise: z.string().min(1),
  })
  .strict();

const ProductsSchema = z
  .object({
    droid: z.string().min(1),
    droidCli: z.string().min(1),
    factory: z.string().min(1),
    factoryApp: z.string().min(1),
    droidExec: z.string().min(1),
    droidShield: z.string().min(1),
    droidShieldPlus: z.string().min(1),
    droidCore: z.string().min(1),
    factoryMissions: z.string().min(1),
  })
  .strict();

const UrlsSchema = z
  .object({
    factory: z.string().url(),
    app: z.string().url(),
    api: z.string().url(),
    docs: z.string().url(),
    downloads: z.string().url(),
    trust: z.string().url(),
    discord: z.string().url(),
    github: z
      .object({
        org: z.string().url(),
        repo: z
          .object({
            factory: z.string().url(),
            action: z.string().url(),
            sdkTs: z.string().url(),
            sdkPy: z.string().url(),
            plugins: z.string().url(),
            eslint: z.string().url(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const EmailsSchema = z
  .object({
    support: z.string().email(),
    security: z.string().email(),
  })
  .strict();

const InstallSchema = z
  .object({
    macos: z.string().min(1),
    windows: z.string().min(1),
    npm: z.string().min(1),
    brew: z.string().min(1),
  })
  .strict();

const LegalSchema = z
  .object({
    entity: z.string().min(1),
    copyright: z.string().min(1),
  })
  .strict();

export const VarsSchema = z
  .object({
    plans: PlansSchema,
    products: ProductsSchema,
    urls: UrlsSchema,
    emails: EmailsSchema,
    install: InstallSchema,
    legal: LegalSchema,
  })
  .strict();

export type VarsSchema = z.infer<typeof VarsSchema>;
