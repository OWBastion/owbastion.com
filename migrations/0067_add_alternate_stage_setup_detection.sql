-- Stage selectors are spatial configuration, not Workshop source. The base
-- configuration remains the fallback when no alternate stage matches at setup.
UPDATE gameplay_revisions
SET spatial_config_json = json_set(
  spatial_config_json,
  '$.alternateStages[0].setupDetection', json('{"position":[175.87,-9.5,-228],"radius":30}'),
  '$.alternateStages[1].setupDetection', json('{"position":[371,46,176],"radius":30}')
)
WHERE id = 'revision:map.antarctic_peninsula:initial'
  AND map_id = 'map.antarctic_peninsula'
  AND json_valid(spatial_config_json)
  AND json_array_length(json_extract(spatial_config_json, '$.alternateStages')) = 2
  AND json_extract(spatial_config_json, '$.alternateStages[0].stageId') = 'icebreaker'
  AND json_extract(spatial_config_json, '$.alternateStages[1].stageId') = 'laboratory';

UPDATE gameplay_revisions
SET spatial_config_json = json_set(
  spatial_config_json,
  '$.alternateStages[0].setupDetection', json('{"position":[322.692,-21.52,42.832],"radius":30}'),
  '$.alternateStages[1].setupDetection', json('{"position":[131.609,64.254,-159.135],"radius":30}')
)
WHERE id = 'revision:map.ilios:initial'
  AND map_id = 'map.ilios'
  AND json_valid(spatial_config_json)
  AND json_array_length(json_extract(spatial_config_json, '$.alternateStages')) = 2
  AND json_extract(spatial_config_json, '$.alternateStages[0].stageId') = 'lighthouse'
  AND json_extract(spatial_config_json, '$.alternateStages[1].stageId') = 'ruins';
