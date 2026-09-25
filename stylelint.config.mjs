// Design System v2 guardrails. See docs/design-rules/css-ownership.md#guardrails.

const rawPx = /(?<![\w.])(?!(?:1|0)px\b)\d*\.?\d+px/;
const radiusLiteral = /(?<![\w.])(?!0(?:px|rem|em)?(?![\w.])|50%)\d*\.?\d+(?:px|r?em|vw|vh|%)/;
const pageBreakpoints = [/^(?:48|64)rem$/, /^(?:47|63)\.99rem$/];

const rules = {
  'declaration-property-value-disallowed-list': {
    '/^(?:padding|margin|gap|row-gap|column-gap|inset)(?:-.+)?$/': [rawPx],
    '/^border(?:-[a-z]+){0,2}-radius$/': [radiusLiteral],
  },
  'declaration-property-value-allowed-list': {
    'font-weight': [/^(?:400|500|600|700|var\(.+\))$/],
  },
  'media-feature-name-disallowed-list': ['min-width', 'max-width'],
};

export default {
  customSyntax: 'postcss-html',
  ignoreFiles: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.data/**'],
  defaultSeverity: 'error',
  rules,
  overrides: [
    {
      files: ['**/*.css'],
      customSyntax: 'postcss',
    },
    {
      // Page files, global chrome (AppHeader, AdminWorkspace page shell) and the
      // shared stylesheet may use only the two system breakpoints.
      files: [
        'apps/portal/pages/**',
        'apps/portal/layouts/**',
        'apps/portal/assets/css/main.css',
        'apps/portal/components/AppHeader.vue',
        'apps/portal/components/admin/AdminWorkspace.vue',
      ],
      rules: {
        'media-feature-name-disallowed-list': null,
        'media-feature-name-value-allowed-list': {
          'min-width': pageBreakpoints,
          'max-width': pageBreakpoints,
        },
      },
    },
  ],
};
