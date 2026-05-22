import type { VarsSchema } from './schema';

export const vars = {
  plans: {
    Pro: 'Pro',
    Plus: 'Plus',
    Max: 'Max',
    Enterprise: 'Enterprise',
  },
  products: {
    droid: 'Droid',
    droidCli: 'Droid CLI',
    factory: 'Factory',
    factoryApp: 'Factory App',
    droidExec: 'Droid Exec',
    droidShield: 'Droid Shield',
    droidShieldPlus: 'Droid Shield Plus',
    droidCore: 'Droid Core',
    factoryMissions: 'Factory Missions',
  },
  urls: {
    factory: 'https://factory.ai',
    app: 'https://app.factory.ai',
    api: 'https://api.factory.ai',
    docs: 'https://docs.factory.ai',
    downloads: 'https://downloads.factory.ai',
    trust: 'https://trust.factory.ai',
    discord: 'https://discord.gg/zuudFXxg69',
    github: {
      org: 'https://github.com/Factory-AI',
      repo: {
        factory: 'https://github.com/Factory-AI/factory',
        action: 'https://github.com/Factory-AI/droid-action',
        sdkTs: 'https://github.com/Factory-AI/droid-sdk-typescript',
        sdkPy: 'https://github.com/Factory-AI/droid-sdk-python',
        plugins: 'https://github.com/Factory-AI/factory-plugins',
        eslint: 'https://github.com/Factory-AI/eslint-plugin',
      },
    },
  },
  emails: {
    support: 'support@factory.ai',
    security: 'security@factory.ai',
  },
  install: {
    macos: 'curl -fsSL https://app.factory.ai/cli | sh',
    windows: 'irm https://app.factory.ai/cli/windows | iex',
    npm: 'npm install -g droid',
    brew: 'brew install --cask droid',
  },
  legal: {
    entity: 'Factory AI',
    copyright: '© 2025-2026 Factory AI. All rights reserved.',
  },
} as const satisfies VarsSchema;
