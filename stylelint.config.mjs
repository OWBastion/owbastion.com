// Colors come from theme tokens so light and dark both work; everything else is open on `next`.

export default {
  customSyntax: 'postcss-html',
  ignoreFiles: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.data/**'],
  defaultSeverity: 'error',
  rules: {
    'color-no-hex': true,
  },
  overrides: [
    { files: ['**/*.css'], customSyntax: 'postcss' },
  ],
};
