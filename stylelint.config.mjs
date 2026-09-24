// Design System v2 guardrails. See docs/design-rules/css-ownership.md#guardrails.

// Directories that have completed their v2 sweep. Rules report as errors here;
// everywhere else they are warnings. Paths are relative to the repository root.
const errorDirectories = [];

// Individual files that have completed their v2 sweep ahead of the rest of
// their directory (e.g. one sub-area of a large admin sweep). Paths are
// relative to the repository root.
const errorFiles = [
  'apps/portal/components/admin/AdminReviewDetail.vue',
  'apps/portal/components/admin/AdminReviewQueue.vue',
  'apps/portal/components/admin/AdminSubmissionReviewDetail.vue',
  'apps/portal/components/admin/AdminSubmissionReviewSignals.vue',
  'apps/portal/components/admin/AdminAnnotationDirectDialog.vue',
  'apps/portal/components/admin/AdminAnnotationProposalDetail.vue',
  'apps/portal/pages/admin/reviews/index.vue',
  'apps/portal/pages/admin/annotations/index.vue',
  'apps/portal/pages/admin/player-reviews/index.vue',
];

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
      // Page files may use only the two system breakpoints.
      files: ['apps/portal/pages/**', 'apps/portal/layouts/**'],
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
    {
      files: errorFiles,
      defaultSeverity: 'error',
    },
  ],
};
