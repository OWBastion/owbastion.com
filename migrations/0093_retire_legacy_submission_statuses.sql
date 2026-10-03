-- The QQ evidence-retrieval flow is gone; its intermediate states can no longer
-- advance. Any surviving rows have no stored evidence or OCR result, so the
-- player must resubmit.
UPDATE submissions
SET status = 'resubmission_required'
WHERE status IN ('received', 'evidence_pending', 'evidence_stored');
