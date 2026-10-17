// Limited guardrails: token-owned values must not be re-literalised. See docs/design-rules/css-ownership.md.

const radiusLiteral = /(?<![\w.])(?!0(?:px|rem|em)?(?![\w.])|50%)\d*\.?\d+(?:px|r?em|vw|vh|%)/;

export default {
  customSyntax: 'postcss-html',
  ignoreFiles: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.data/**'],
  defaultSeverity: 'error',
  rules: {
    'color-no-hex': true,
    'declaration-property-value-disallowed-list': {
      '/^border(?:-[a-z]+){0,2}-radius$/': [radiusLiteral],
    },
  },
  overrides: [
    { files: ['**/*.css'], customSyntax: 'postcss' },
  ],
};
