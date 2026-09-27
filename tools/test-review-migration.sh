#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-review-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-review-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local representative="${2:-false}"
  while IFS= read -r migration; do
    local name
    name="$(basename "$migration")"
    if [[ "$name" == "0085_revision_scoped_map_reviews.sql" && "$representative" == "true" ]]; then
      sqlite3 -bail "$database" "INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('revision:map.ambiguous:older', 'map.ambiguous', 'historical', '0', 1, 1);"
      sqlite3 -bail "$database" < "$migration"
      continue
    fi
    if [[ "$name" == "0057_reviews.sql" && "$representative" == "true" ]]; then
      sqlite3 -bail "$database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-2', '2', 'Player Two', 'player two', 0, 'active', 1, 1);
INSERT INTO maps (id, name, game_version, status, introduced_version, retired_version, created_at, updated_at)
VALUES ('map.test', 'Test map', '1', 'active', '1', NULL, 1, 1),
       ('map.inactive', 'Inactive map', '1', 'inactive', '1', NULL, 1, 1),
       ('map.ambiguous', 'Ambiguous map', '1', 'inactive', '1', NULL, 1, 1);
INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at)
VALUES ('event.test', 'Test event', 'test', 'common', 'Test', '1', 'implemented', 1, 1);
SQL
      sqlite3 -bail "$database" < "$migration"
      sqlite3 -bail "$database" <<'SQL'
INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, created_at, updated_at)
VALUES ('review-legacy-map', 'player-1', 'map', 'map.test', 5, 1, 1),
       ('review-inactive-map', 'player-1', 'map', 'map.inactive', 3, 1, 1),
       ('review-ambiguous-map', 'player-1', 'map', 'map.ambiguous', 2, 1, 1);
INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, created_at, updated_at)
VALUES ('review-event', 'player-1', 'event', 'event.test', 4, 1, 1);
SQL
      continue
    fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviews';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('reviews');" | grep -Ec 'reviews_(player_event|player_legacy_map|player_map_revision|target_status)_idx')" == "4" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM pragma_table_info('reviews') WHERE name = 'gameplay_revision_id';")" == "1" ]]

apply_migrations "$representative_database" true
[[ "$(sqlite3 "$representative_database" "SELECT gameplay_revision_id IS NULL FROM reviews WHERE id = 'review-legacy-map';")" == "0" ]]
[[ "$(sqlite3 "$representative_database" "SELECT gameplay_revision_id IS NULL FROM reviews WHERE id = 'review-inactive-map';")" == "0" ]]
[[ "$(sqlite3 "$representative_database" "SELECT gameplay_revision_id FROM reviews WHERE id = 'review-inactive-map';")" == "revision:map.inactive:initial" ]]
[[ "$(sqlite3 "$representative_database" "SELECT gameplay_revision_id IS NULL FROM reviews WHERE id = 'review-ambiguous-map';")" == "1" ]]
revision_id="$(sqlite3 "$representative_database" "SELECT id FROM gameplay_revisions WHERE map_id = 'map.test' AND lifecycle = 'default';")"
[[ -n "$revision_id" ]]
sqlite3 -bail "$representative_database" "INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('revision:map.test:old', 'map.test', 'historical', '0', 1, 1);"
sqlite3 -bail "$representative_database" "INSERT INTO reviews (id, player_account_id, target_type, target_id, gameplay_revision_id, rating, created_at, updated_at) VALUES ('review-current-map', 'player-2', 'map', 'map.test', '$revision_id', 4, 1, 1), ('review-old-map', 'player-2', 'map', 'map.test', 'revision:map.test:old', 3, 1, 1);"
if sqlite3 -bail "$representative_database" "INSERT INTO reviews (id, player_account_id, target_type, target_id, gameplay_revision_id, rating, created_at, updated_at) VALUES ('review-scoped-map-duplicate', 'player-2', 'map', 'map.test', '$revision_id', 3, 1, 1);" 2>/dev/null; then
  echo "Expected exact player/map/revision uniqueness to reject a duplicate row." >&2
  exit 1
fi
if sqlite3 -bail "$representative_database" "INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, created_at, updated_at) VALUES ('review-event-duplicate', 'player-1', 'event', 'event.test', 3, 1, 1);" 2>/dev/null; then
  echo "Expected stable event review uniqueness to reject a duplicate row." >&2
  exit 1
fi
[[ "$(sqlite3 "$representative_database" "SELECT COUNT(*) FROM reviews WHERE target_type = 'map' AND gameplay_revision_id IS NULL;")" == "1" ]]

echo "Revision-scoped review migration checks passed."
