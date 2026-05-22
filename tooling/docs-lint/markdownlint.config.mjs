export default {
  config: {
    default: true,
    MD001: false,
    MD013: false,
    MD033: false,
    MD040: false,
    MD025: { level: 2 },
  },
  globs: ['**/*.md'],
  ignores: [
    'docs/jp/**',
    'node_modules/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/.factory/**',
    '**/.husky/_/**',
  ],
  noBanner: true,
  noProgress: true,
};
