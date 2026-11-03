# Player Reviews

Ratings for events and maps. Privacy: [data-and-security.md](../dev-rules/data-and-security.md).

## Model

- A review stores target type and ID, the account, a 1-5 rating, optional comment,
  anonymous-display preference, lifecycle state, and timestamps; no copied catalog facts.
  One current row per player and target; retries and later submissions update it.
- New reviews are accepted only for implemented, non-archived events and active maps. Map reviews bind to the
  exact Gameplay Revision ID (single reads, writes, comments, summaries require it; batched
  summaries pair map ID with revision ID). Reviews recorded before revision attribution keep
  a NULL revision, are never backfilled, are excluded from revision-specific aggregates,
  and remain visible to maintainers. Event reviews bind to the stable Event (NULL revision).
- Withdrawn and invalidated rows stay auditable. Hiding a comment is independent of
  invalidating the review: a hidden comment keeps its rating; an invalidated review leaves
  all aggregates. Ratings are feedback only and never change difficulty, weights, release
  state, Agents projections, or Bastion data.

## Historical survey ratings

The legacy rating survey was imported once. Those reviews are event reviews with no player
account: always anonymous and active, with the submission date as creation time. The
`import_id`, source row ID, and original submitter label stay for maintainers only; the label is
not an identity, because the migration merged many visitors under one label. They stay in
aggregates and comments, including those of removed events, because removal only takes an event
out of the pool. Moderation treats them like any other review. There is no import feature.

## Public reads

Summary, bounded batch, and paginated comments for an event or map. Summaries give the
average, valid count, 1-5 distribution, and the shared three-review `sampleInsufficient`
rule. Comments exclude hidden, withdrawn, and invalidated rows; anonymous comments have no
author, others show the public display name. The home page shows up to three random featured comments: active, visible event reviews rated
4 or 5 with at least 8 characters, for non-archived implemented or removed events. They show
rating, comment, and event name, never an author. Each load draws again, and a failed read hides
the section. Reads are private and uncached; the batch
resolves directory targets in one bounded operation, never one query per card.

## Moderation

Maintainer routes are private. List and detail may include the account, numeric player ID,
anonymity preference, lifecycle, and audit context (public and player routes omit them).
Comment hide/restore changes only the comment projection; whole-review invalidate/restore
changes the aggregate boundary. Both keep the row, audit, accept an optional reason, and use
actor-scoped idempotency. Portal uses the shared admin workspace/table/dialog patterns with
mobile records in document flow and stable review IDs.
