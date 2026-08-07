# Portal editorial pilot

This record separates the local editorial foundation from the production
migration required by issue #70. The two committed Markdown files are the
technical samples introduced for the Nuxt Content foundation; they are not
claimed to be migrated Feishu posts.

## Missing migration inputs

The repository currently contains no Feishu export, source document, public
media inventory, or release approval for the pilot. A real migration must
provide those inputs to the operator without committing private Feishu links,
temporary signed URLs, QQ identifiers, or private screenshots. Media selected
for publication must be copied to a durable path under
`apps/portal/public/content/` and referenced by that Portal path.

Until the source and media inventory are supplied, the current status is
`coded`, not `integration-tested` or `production-verified`.

## Production evidence to record

Use a fresh, safe request identifier and retain only status, immutable revision,
public URL, and workflow run references. Never record cookies, Git credentials,
private identifiers, full article payloads, or Feishu download URLs.

| Check | Required evidence | Current state |
| --- | --- | --- |
| Anonymous Blog list/detail | Public list and one detail URL return the pilot entry | Not run |
| Anonymous Changelog list/detail | Public list and one released-version detail URL return the pilot entry | Not run |
| Non-admin and expired session | `/admin/content`, `/_studio`, and Studio write routes deny access | Local auth tests only; production not run |
| Admin entry | Existing platform Admin session reaches Studio without GitHub OAuth | Production not run |
| Pilot edit and publish | Studio edit creates the intended content-only Git commit on `main` | Requires source, admin session, and server token |
| CI and deploy | Existing Portal checks, image publication, and immutable deployment complete | No push or deployment performed |
| Public reflection | Deployed public page shows the published change | No deployment performed |
| Credential boundary | Token absent from browser output, public content, logs, and repository files | Local bundle/config checks pass |

The remaining Feishu archive is follow-up work. It must not be expanded into
this pilot until the source and media inventory are explicitly selected.
