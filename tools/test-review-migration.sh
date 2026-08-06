#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-review-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-review-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    if [[ "$skip_latest" == "true" && "$(basename "$migration")" == "0057_reviews.sql" ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviews';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('reviews');" | rg -c 'reviews_(player_target|target_status)_idx')" == "2" ]]

apply_migrations "$representative_database" true
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO maps (id, name, game_version, status, introduced_version, retired_version, created_at, updated_at)
VALUES ('map.test', 'Test map', '1', 'active', '1', NULL, 1, 1);
INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at)
VALUES ('event.test', 'Test event', 'test', 'common', 'Test', '1', 'implemented', 1, 1);
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0057_reviews.sql"
sqlite3 -bail "$representative_database" "INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, created_at, updated_at) VALUES ('review-1', 'player-1', 'map', 'map.test', 5, 1, 1);"
if sqlite3 -bail "$representative_database" "INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, created_at, updated_at) VALUES ('review-2', 'player-1', 'map', 'map.test', 4, 1, 1);" 2>/dev/null; then
  echo "Expected review uniqueness constraint to reject a duplicate player/target row." >&2
  exit 1
fi

echo "Review migration checks passed."
