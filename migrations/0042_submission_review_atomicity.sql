CREATE UNIQUE INDEX submission_reviews_submission_id_idx ON submission_reviews(submission_id);
CREATE UNIQUE INDEX player_title_grants_source_idx ON player_title_grants(source_type, source_id);
