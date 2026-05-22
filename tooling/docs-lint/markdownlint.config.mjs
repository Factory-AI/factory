export default {
  config: {
    default: true,
    MD001: false,
    MD013: false,
    MD033: false,
    MD040: false,
    MD025: { level: 2 },
  },
  globs: ['*.md', 'docs/**/*.md'],
  ignores: ['docs/jp/**'],
  noBanner: true,
  noProgress: true,
};
