// Design System v2 guardrails. See docs/design-rules/css-ownership.md#guardrails.

// Directories that have completed their v2 sweep. Rules report as errors here;
// everywhere else they are warnings. Paths are relative to the repository root.
const errorDirectories = [];

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
  defaultSeverity: 'warning',
  rules,
  overrides: [
    {
      files: ['**/*.css'],
      customSyntax: 'postcss',
    },
    {
      // Page files, and main.css's own page-shell/page-chrome rules, may use
      // only the two system breakpoints.
      files: ['apps/portal/pages/**', 'apps/portal/layouts/**', 'apps/portal/assets/css/main.css'],
      rules: {
        'media-feature-name-disallowed-list': null,
        'media-feature-name-value-allowed-list': {
          'min-width': pageBreakpoints,
          'max-width': pageBreakpoints,
        },
      },
    },
    ...errorDirectories.map((dir) => ({
      files: [`${dir}/**`],
      defaultSeverity: 'error',
    })),
  ],
};
