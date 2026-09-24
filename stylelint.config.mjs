// Design System v2 guardrails. See docs/design-rules/css-ownership.md#guardrails.

// Directories (or individual files) that have completed their v2 sweep. Rules
// report as errors here; everywhere else they are warnings. Paths are
// relative to the repository root. An entry ending in a file extension is
// matched as-is; everything else is treated as a directory prefix.
const errorDirectories = [
  'apps/portal/components/AppHeader.vue',
  'apps/portal/components/PageSectionHeader.vue',
  'apps/portal/components/AccountMenu.vue',
  'apps/portal/components/PlayerBattleTag.vue',
  'apps/portal/components/StatusBadge.vue',
  'apps/portal/components/content',
  'apps/portal/components/events',
  'apps/portal/components/maps',
  'apps/portal/components/player',
  'apps/portal/components/reviews',
  'apps/portal/components/submissions',
  'apps/portal/layouts',
  'apps/portal/pages/index.vue',
  'apps/portal/pages/events.vue',
  'apps/portal/pages/maps.vue',
  'apps/portal/pages/achievements.vue',
  'apps/portal/pages/me.vue',
  'apps/portal/pages/bind.vue',
  'apps/portal/pages/login',
  'apps/portal/pages/submissions',
  'apps/portal/pages/blog',
  'apps/portal/pages/changelog',
];

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
  'apps/portal/components/admin/AdminPlayerDetail.vue',
  'apps/portal/components/admin/AdminPlayerIdentityEditor.vue',
  'apps/portal/components/admin/AdminPlayerTitles.vue',
  'apps/portal/components/admin/AdminTitleMigrationDetail.vue',
  'apps/portal/components/admin/AdminTitleMigrationHolders.vue',
  'apps/portal/components/admin/BindingInviteBatchPanel.vue',
  'apps/portal/components/admin/BindingInvitePanel.vue',
  'apps/portal/pages/admin/bindings.vue',
  'apps/portal/pages/admin/grants.vue',
  'apps/portal/pages/admin/titles.vue',
  'apps/portal/pages/admin/players/[playerAccountId].vue',
  'apps/portal/pages/admin/players/index.vue',
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
      // Page files, plus AppHeader (global page chrome, not container-sized),
      // may use only the two system breakpoints.
      files: ['apps/portal/pages/**', 'apps/portal/layouts/**', 'apps/portal/components/AppHeader.vue'],
      rules: {
        'media-feature-name-disallowed-list': null,
        'media-feature-name-value-allowed-list': {
          'min-width': pageBreakpoints,
          'max-width': pageBreakpoints,
        },
      },
    },
    ...errorDirectories.map((entry) => ({
      files: [/\.[a-z]+$/.test(entry) ? entry : `${entry}/**`],
      defaultSeverity: 'error',
    })),
    {
      files: errorFiles,
      defaultSeverity: 'error',
    },
  ],
};
