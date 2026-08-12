-- 0066_backfill_initial_gameplay_revision_spatial_configs: materialise the
-- existing Bastion coordinate baseline on the platform-owned initial revisions.
--
-- This is a one-time data repair. It never copies player progress or title
-- grants. Existing administrator-provided spatial configurations are retained.

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-27.31,30.462,99.799],[-45.351,15.454,79.671],[-23.956,16.004,43.016],[-29.999,17.009,17.751],[-87.158,14.004,-21.012],[-70.585,13.295,39.948],[-21.061,13.813,-64.931],[-45.813,14.934,-79.517],[4.542,17.737,61.038],[-4.835,12.464,-0.137],[4.44,17.737,-60.62],[-90.802,14.002,-60.156]],"resetPosition":[16.37,15,104.47],"endPosition":[-78.02,9.19,-39.93],"thirdPersonPosition":[-6.21,15,104.33],"creditsPosition":[5.1,19.5,105.79],"control":{"centerPositions":[],"jumpPositions":[],"respawnPositions":[[4.85,15.5,104.6]],"respawnAxis":"z","respawnAxisThreshold":30},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.aatlis:initial'
  AND map_id = 'map.aatlis'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-98.119,15.423,46.112],[-103.198,12.267,17.698],[-94,19.5,-28.74],[-68,16.41,-47.6],[-85.854,8.087,-0.132],[-113.76,9.5,-23.19],[244.902,-1,-226.505],[236.299,-3.86,-255.149],[283.34,28.04,-201.87],[318.253,-4.899,-211.882],[336.311,-6.618,-242.569],[283.936,-8.688,-253.317]],"resetPosition":[-95.12,9.47,90.05],"endPosition":[354.1,-9.5,-226.25],"thirdPersonPosition":[-76.97,9.04,87],"creditsPosition":[-85.96,9.25,98.83],"control":{"centerPositions":[],"jumpPositions":[[-79.07,12.7,-63.71]],"respawnPositions":[[-90.25,9.25,90],[175.87,-9.5,-228]],"respawnAxis":"z","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[],"alternateStages":[{"stageId":"icebreaker","bastionPositions":[[244.902,-1,-226.505],[236.299,-3.86,-255.149],[283.34,28.04,-201.87],[318.253,-4.899,-211.882],[336.311,-6.618,-242.569],[283.936,-8.688,-253.317],[358.414,64.664,155.328],[329.109,48.084,166.447],[269.63,68.9,209.25],[270.34,42.58,139.77],[214.64,53.09,189.61]],"resetPosition":[173.68,-6.85,-246.89],"endPosition":[209.17,51.5,161.47],"thirdPersonPosition":[171.42,-6.88,-236.82],"creditsPosition":[172.58,-8.46,-229.17],"control":{"centerPositions":[],"jumpPositions":[[354.1,-9.5,-226.25]],"respawnPositions":[[175.87,-9.5,-228],[371,46,176]],"respawnAxis":"z","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[]},{"stageId":"laboratory","bastionPositions":[[358.414,64.664,155.328],[329.109,48.084,166.447],[269.63,68.9,209.25],[270.34,42.58,139.77],[214.64,53.09,189.61],[246.75,55.6,151.36],[-98.119,15.423,46.112],[-103.198,12.267,17.698],[-94,19.5,-28.74],[-68,16.41,-47.6],[-85.854,8.087,-0.132]],"resetPosition":[371.95,47.01,185.5],"endPosition":[-79.07,12.7,-63.71],"thirdPersonPosition":[370.25,47,164.04],"creditsPosition":[380.23,47.21,173.1],"control":{"centerPositions":[],"jumpPositions":[[209.17,51.5,161.47]],"respawnPositions":[[371,46,176],[-90.25,9.25,90]],"respawnAxis":"z","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[]}]}'
WHERE id = 'revision:map.antarctic_peninsula:initial'
  AND map_id = 'map.antarctic_peninsula'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[18.158,1.217,-56.711],[17.999,6.029,-30.873],[14.01,3.189,-9.077],[34.905,5.09,4.157],[4.54,6.004,26.42],[10.071,1.931,38.699]],"resetPosition":[20.46,1,-104.03],"endPosition":[16.12,1,66.52],"thirdPersonPosition":[15.45,1,-103.8],"creditsPosition":[17.69,9.22,-111.87],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.ayutthaya:initial'
  AND map_id = 'map.ayutthaya'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-114.474,4.902,100.451],[-115.368,4.75,129.864],[-82.619,1.75,147.017],[-35.778,11.637,106.066],[-38.722,-0.204,66.024],[25.083,6,67.282],[3.062,-0.097,20.98],[23.863,-4,0.817]],"resetPosition":[-150.25,0.83,104.51],"endPosition":[26.53,-4.1,-7.83],"thirdPersonPosition":[-149.17,0.83,100.85],"creditsPosition":[-170.8,3.65,96.45],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.blizzard_world:initial'
  AND map_id = 'map.blizzard_world'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-327.44,17.73,166.8],[-328.51,15.08,140.81],[-277.4,11.13,144.4],[-379.43,11.13,144.41],[22.02,13.86,-121.16],[51.84,13.48,-97.4],[80.67,20,-106.93],[111.43,18.54,-169.79],[268.37,15.09,205.62],[249.27,14.29,236.1],[228.22,10.09,231.08],[200.31,19.43,223.76],[177.1,9.69,253.19],[173.93,12.87,267.78]],"resetPosition":[-409.71,10.11,165.61],"endPosition":[158.67,10.81,260.91],"thirdPersonPosition":[-410.4,10.11,162.37],"creditsPosition":[-426.04,13.11,165.81],"control":{"centerPositions":[[-328.53,8.17,153.32],[51.89,14.5,-114.7],[222.72,9.24,241.77]],"jumpPositions":[[-248.55,10.35,152.77],[104.77,17.74,-137.21]],"respawnPositions":[[-426.04,11.11,165.81],[-30.95,17,-125.55],[291.62,11.09,208.25]],"respawnAxis":"x","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.busan:initial'
  AND map_id = 'map.busan'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[97.763,15.967,29.045],[64.607,19.071,23.437],[61.918,17.956,15.709],[88.977,14.931,-25.352],[59.133,29.301,-30.146],[13.16,16.52,-44.31],[10.33,6,5.54],[-23.15,7.58,19.14],[-15.61,13,-45.26],[-40.6,4.25,-35.79],[-67.822,6.067,-43.245]],"resetPosition":[129.68,10,0.04],"endPosition":[-45.08,10,-13.37],"thirdPersonPosition":[135.08,10,-3.31],"creditsPosition":[147.52,11.5,-10.9],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.circuit_royal:initial'
  AND map_id = 'map.circuit_royal'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[60.94,12.5,-13.78],[30.54,5.09,6.64],[-7.85,20,-29.95],[-21.88,7.49,-3],[-54.52,12.46,-10.1],[-9.98,5,-39.5],[-60.93,12.21,-11.91],[-87.64,16.77,-22.43]],"resetPosition":[111.17,9,-50.91],"endPosition":[-90.31,9,-33.55],"thirdPersonPosition":[117.38,9,-38.98],"creditsPosition":[117.64,13,-48.66],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.colosseo:initial'
  AND map_id = 'map.colosseo'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[167.25,10.85,42.4],[113.04,13.8,24.63],[112.06,17.25,-2.91],[102.79,11.01,-23.56],[78.973,17.48,-6.843],[34.78,10.05,-6.8],[32.21,10.59,20.55],[8.83,2.38,25.76]],"resetPosition":[183.3,7.04,37.96],"endPosition":[15.47,9.54,-1],"thirdPersonPosition":[182.47,7.04,42.27],"creditsPosition":[197.72,10.01,44.63],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.dorado:initial'
  AND map_id = 'map.dorado'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[115.78,14.732,-29.038],[119.48,18.855,-43.12],[54.429,23.32,-102.936],[75.164,12.66,-71.852],[36.49,8.938,-71.14],[2.584,8.026,-63.687],[-12.503,3.514,-31.548],[0.632,6.073,-2.154],[-32.381,-1.334,0.005],[70.234,18.381,-65.979],[8.544,10.396,-42.598]],"resetPosition":[128.06,10.72,1.84],"endPosition":[-26.72,1.97,-34.09],"thirdPersonPosition":[131.335,10.72,1.098],"creditsPosition":[132.82,13.72,9.04],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.eichenwalde:initial'
  AND map_id = 'map.eichenwalde'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[86.815,-0.268,-54.406],[63.789,1,-57.796],[14.121,3.261,-42.146],[1.238,7.966,13.923],[0.025,-0.002,-33.787],[-15.8,3.08,-39.1],[-45.384,-1.583,-60.618],[60.25,-6,-93.538],[-26.245,0,-80.277],[-108.094,-1.002,-60.285],[-71.269,1.05,-49.368],[0.047,-2,-69.042]],"resetPosition":[126.7,-1.64,-81.42],"endPosition":[-117.37,-3,-45.65],"thirdPersonPosition":[126.7,-1.64,-90.03],"creditsPosition":[116.67,-0.29,-82.29],"control":null,"portalPositions":[],"springboardPositions":[[-73.72,-3,-34.19]],"alternateStages":[]}'
WHERE id = 'revision:map.esperanca:initial'
  AND map_id = 'map.esperanca'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-20.75,9.21,-78.14],[11.87,7.21,-47.22],[28.31,10.47,6.6],[-6.95,8.01,-10.86],[49.13,14.56,17.96],[52.2,-1,-0.58],[15.61,11.98,17.47],[46.87,-0.16,-15.6],[60.13,-1.04,-15.61]],"resetPosition":[-46.98,1,-101.54],"endPosition":[51.7,-1.87,25.91],"thirdPersonPosition":[-33.2,1,-115.04],"creditsPosition":[-48.1,2.5,-116.08],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.hanamura:initial'
  AND map_id = 'map.hanamura'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-22.263,46.024,-89.586],[-5.326,42.977,-59.814],[6.729,45.55,-48.776],[29.532,44.5,7.09],[-2.847,42.51,7.305],[-17.813,45.889,63.611],[-21.392,45.952,103.426],[14.139,41.045,99.842],[-12.338,40.538,39.81],[-17.161,40.545,-19.673]],"resetPosition":[-9.08,44.05,-133.26],"endPosition":[20.36,39.83,112.51],"thirdPersonPosition":[-0.64,44.05,-133.89],"creditsPosition":[-5.02,50.05,-142.63],"control":{"centerPositions":[],"jumpPositions":[],"respawnPositions":[[-7.69,44.25,-140.5]],"respawnAxis":"z","respawnAxisThreshold":30},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.hanaoka:initial'
  AND map_id = 'map.hanaoka'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[117.332,14.433,-58.091],[97,9.01,-25.51],[62.21,12.06,-83.3],[11.58,7.96,-52.71],[10.13,6,-100.38],[-37.54,8.23,-72.23],[-77.17,10.13,-66.78]],"resetPosition":[158.3,11,-44.35],"endPosition":[-77.24,7.22,-49.83],"thirdPersonPosition":[158.256,11,-47.739],"creditsPosition":[193.45,13.25,-46.49],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.havana:initial'
  AND map_id = 'map.havana'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-20.813,9.795,-128.879],[-6.517,15.305,-105.981],[-14.73,6.027,-67.67],[4.162,11.155,-39.796],[-15.818,5.751,-7.412],[-1.715,2.332,10.867],[-31.241,4.84,49.397],[25.884,7.646,-68.66]],"resetPosition":[-23.64,3.92,-157.44],"endPosition":[-48.89,-0.15,53.12],"thirdPersonPosition":[-27.291,3.92,-156.654],"creditsPosition":[-31.65,8.96,-175.05],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.hollywood:initial'
  AND map_id = 'map.hollywood'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-15.287,6,-127.244],[16.25,11.86,-106.756],[62.52,14,-77.97],[33.14,13.03,-43.68],[19.496,9,-1.439],[66.687,8.52,-37.241]],"resetPosition":[-45.62,5,-156.87],"endPosition":[34.476,12,-23.518],"thirdPersonPosition":[-41.39,5,-159.03],"creditsPosition":[-55.87,7.68,-171.97],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.horizon_lunar_colony:initial'
  AND map_id = 'map.horizon_lunar_colony'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-173.701,-0.46,-71.552],[-207.983,5.46,-31.971],[-222.539,0.1,-30.825],[-223.926,5.56,-16.079],[-245.721,5.56,5.19],[-257.45,2.85,35.113]],"resetPosition":[-160.308,-1.355,-91.403],"endPosition":[-271.14,-5.585,33.279],"thirdPersonPosition":[-148.168,-1.504,-88.932],"creditsPosition":[-150.88,0.2,-97.02],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[{"stageId":"lighthouse","bastionPositions":[[321.799,-17.29,26.126],[314.215,-16.35,-18.283],[358.768,-6.597,-47.48],[353.915,-10.86,-53.746],[364.601,-25.62,-54.434],[304.692,-15.91,-42.049],[319.744,-24.11,-69.502]],"resetPosition":[331.08,-21.52,41.121],"endPosition":[321.229,-26.291,-88.556],"thirdPersonPosition":[318.997,-21.52,37.66],"creditsPosition":[321.8,-20,46],"control":null,"portalPositions":[],"springboardPositions":[]},{"stageId":"ruins","bastionPositions":[[111.31,68.78,-183.068],[83.25,67.65,-179.529],[28.394,61.39,-148.333],[5.918,60.37,-170.376],[-26.8,67.62,-178.826],[-52.04,65.39,-179.058]],"resetPosition":[128.072,63.254,-165.528],"endPosition":[-47.306,58.37,-184.722],"thirdPersonPosition":[129.56,62.45,-153.472],"creditsPosition":[137.54,63.92,-158.9],"control":null,"portalPositions":[],"springboardPositions":[]}]}'
WHERE id = 'revision:map.ilios:initial'
  AND map_id = 'map.ilios'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-101.37,12.72,-135.27],[-72.634,6.669,-145.321],[-57.67,13.98,-92.45],[-27.85,14.52,-97.33],[-25.34,8.29,-36.47],[-5.66,14.63,-74.46],[32.15,15.16,-89.13]],"resetPosition":[-103.91,11.69,-86.6],"endPosition":[30.248,5.515,-81.733],"thirdPersonPosition":[-88.03,11.22,-88],"creditsPosition":[-92.71,14.04,-73.79],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.junkertown:initial'
  AND map_id = 'map.junkertown'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-143.9,7.13,10.15],[-116.44,6.13,5.72],[-103.12,6.93,-4.02],[-91.99,7.5,-28.63],[-66.62,4.5,-35.93],[-29.17,2.55,-31.43],[-10.67,16.97,5.65]],"resetPosition":[-175.23,-0.07,43.03],"endPosition":[-1.9,5,-0.29],"thirdPersonPosition":[-176.048,-0.07,36.54],"creditsPosition":[-185.56,3.53,38.32],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.kings_row:initial'
  AND map_id = 'map.kings_row'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[34.55,33.85,-36.64],[21.25,10,-23.95],[0.93,0,-9.84],[3.65,8.01,-52.48],[-30.81,25.99,-14.77],[41.48,95.87,140.62],[-0.08,94,184.97],[-16.66,96.5,120.91],[-66.07,94,150.2],[46.34,267,300.86],[-10.14,270.12,321.4],[-0.2,278.01,290.98],[2.79,274.19,301.82],[-46.63,267.11,300.97]],"resetPosition":[81.11,4.58,-35.44],"endPosition":[-44.02,271.64,349.77],"thirdPersonPosition":[74.43,4.46,-26.34],"creditsPosition":[84.29,6.2,-29.44],"control":{"centerPositions":[],"jumpPositions":[[-58.26,6,-5.24],[-51.89,95,133.97]],"respawnPositions":[[84.41,4.52,-31.57],[86.21,96.62,147.7],[62.93,267.64,349.53]],"respawnAxis":"y","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.lijiang_tower:initial'
  AND map_id = 'map.lijiang_tower'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[59.17,9.847,-6.159],[118.361,5.867,-78.645],[133.892,5.637,-53.775],[92.256,8.438,-22.921],[77.01,13.219,-20.601],[43.662,8.805,12.811],[59.729,9.199,38.82],[7.768,9.061,44.804],[11.395,9.676,91.561],[-13.854,9.931,73.748]],"resetPosition":[119.51,1.84,-104.94],"endPosition":[12.91,3.75,127.69],"thirdPersonPosition":[133.91,1.84,-104.94],"creditsPosition":[126.5,3,-125.37],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.midtown:initial'
  AND map_id = 'map.midtown'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[0.708,4.061,388.523],[-12.132,8.845,372.132],[19.299,2.75,355.878],[1.929,8.359,320.916],[35.587,7.414,295.986],[35.936,7.413,287.017],[5.606,12.76,268.637],[15.272,5.226,241.462],[-22.805,6.146,239.808]],"resetPosition":[2.31,0.75,431.46],"endPosition":[-12.85,8.09,220.7],"thirdPersonPosition":[-17.28,0.75,431.46],"creditsPosition":[-7.51,4.05,438.32],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.neon_junction:initial'
  AND map_id = 'map.neon_junction'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-152.68,-92.115,-64.862],[-193.849,-89.578,-32.592],[-199.313,-94.457,41.386],[-146.246,-88.751,48.509],[-26.436,22,-69.808],[-25.182,13,0.688],[-73.662,19.545,0.132],[-42.208,20.025,51.77],[-187.057,-87.686,7.868],[73.112,129.717,-67.245],[94.679,140.26,-17.696],[92.445,141.37,49.176]],"resetPosition":[-165.4,-95.85,-88.15],"endPosition":[103.15,132,52.57],"thirdPersonPosition":[-158.45,-95.97,-78.36],"creditsPosition":[-157.98,-90.95,-89.77],"control":{"centerPositions":[],"jumpPositions":[[-148.56,-92.25,64.75],[-21.67,21,81.47]],"respawnPositions":[[-161,-95.97,-84.17],[-39.04,17.84,-99.75],[85.52,132.49,-96.2]],"respawnAxis":"y","respawnAxisThreshold":30},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.nepal:initial'
  AND map_id = 'map.nepal'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-45.678,8.298,88.433],[-74.958,6.937,72.937],[-76.296,7.756,40.01],[-74.877,6.937,7.044],[-78.144,-0.941,-19.954],[-55.165,8.251,-0.152],[-25.305,9.706,32.074],[13.116,4.058,87.188],[-15.766,7.025,0.028],[-31.324,8.111,-39.913],[-85.606,0.947,44.387],[-74.415,4.499,-63.359]],"resetPosition":[5.33,8.14,109.05],"endPosition":[-43,28.65,-39.96],"thirdPersonPosition":[2.08,8.02,109.16],"creditsPosition":[0.68,11.77,120.02],"control":{"centerPositions":[],"jumpPositions":[[-91.45,2,-5.21]],"respawnPositions":[[-0.7,8.02,113.02],[-118.06,30.58,-2.12]],"respawnAxis":"z","respawnAxisThreshold":30},"portalPositions":[[-91.45,2,-5.21],[-118.06,30.58,-2.12]],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.new_junk_city:initial'
  AND map_id = 'map.new_junk_city'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-74.922,14.194,-16.661],[-25.688,4,-22.819],[-29.72,7.12,-6.68],[-7.696,4.85,35.246],[-0.035,2.376,-11.505],[19.183,1.477,-27.407],[15.862,5.063,-12.591],[39.34,8.1,-12.938],[51.915,10,-17.308]],"resetPosition":[-111.17,11,-17],"endPosition":[90,11,-45.9],"thirdPersonPosition":[-111.26,11,-32.03],"creditsPosition":[-102.08,17.29,-24.46],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.new_queen_street:initial'
  AND map_id = 'map.new_queen_street'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[203.716,0.209,-0.271],[151.942,4.337,-5.45],[127.026,2.25,17.094],[123.932,-3.925,-10.396],[85.613,6.25,20.496],[87.894,1.89,-3.3],[39.195,5.496,6.518],[32.85,3.119,34.634],[69.994,6.25,15.541],[118.084,4.25,3.814]],"resetPosition":[224.54,0.2,0.39],"endPosition":[23,3.12,39.72],"thirdPersonPosition":[225.74,0.2,4.55],"creditsPosition":[254.54,3.2,22.87],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.numbani:initial'
  AND map_id = 'map.numbani'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[170.7,13.57,-216.17],[123.6,12,-229.92],[78.92,10,-253.17],[111.34,13.57,-278.41],[-196.79,21.65,56.69],[-202.91,9.12,-0.1],[-177.5,20.25,0.19],[-183.17,20.06,-61.79],[110.54,2,283.01],[140.16,10,250.39],[171.91,4.12,277],[150.98,3.85,223.89],[173.51,2,217.63]],"resetPosition":[193.61,8.42,-197.03],"endPosition":[195.13,0.85,172.87],"thirdPersonPosition":[191.33,8.42,-194.73],"creditsPosition":[204.41,8.42,-184.71],"control":{"centerPositions":[[129.5,15.28,-235.74],[-192.08,15,0.26],[143.44,2.15,247.95]],"jumpPositions":[[82.13,5.49,-273.2],[-175.4,16,-61.35]],"respawnPositions":[[200.46,6.42,-188.28],[-195.03,20,89.71],[69.73,1,321.16]],"respawnAxis":"z","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.oasis:initial'
  AND map_id = 'map.oasis'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-47.03,6.86,-141.73],[5.22,12,-122],[-5.81,10,-88.75],[10.08,3.9,-56.92],[-13.62,8.22,-44.11],[11.42,5.1,-24.26],[-6.88,0.5,26.09],[-40.63,3,40.01]],"resetPosition":[-78.3,5.03,-170.8],"endPosition":[-39.54,-2,62.86],"thirdPersonPosition":[-78.25,6.33,-167.96],"creditsPosition":[-70.2,7.75,-183.14],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.paraiso:initial'
  AND map_id = 'map.paraiso'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-95.984,13.454,-83.535],[-72.132,11.976,-44.042],[-42.867,18.51,-12.093],[-30.23,10.02,3.28],[-14.721,14.25,-35.219],[-2.715,10.08,-52.081]],"resetPosition":[-115.03,15.97,-122.82],"endPosition":[9.563,8.329,-59.98],"thirdPersonPosition":[-109.263,15.3,-111.151],"creditsPosition":[-119.74,19,-132.45],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.paris:initial'
  AND map_id = 'map.paris'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-64.421,5.04,-125.927],[-36.002,4.75,-77.344],[-19.68,3.7,-38.47],[59.058,0.07,-8.103],[54.797,1.74,-59.938],[87.874,-0.37,0.268],[60.53,50.43,61.63],[-13.12,4.75,47.31],[27.18,4.75,36.89],[20.9,0.75,54.61],[-19.85,10.75,11.92]],"resetPosition":[-59.05,3.75,-158.41],"endPosition":[-12.27,-1.25,-14.73],"thirdPersonPosition":[-54.92,3.75,-158.32],"creditsPosition":[-57.06,5.25,-181.51],"control":{"centerPositions":[],"jumpPositions":[[98.662,-1.5,-21.009]],"respawnPositions":[[-52.36,3.83,-176.36],[53.17,1.25,22.99]],"respawnAxis":null,"respawnAxisThreshold":null},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.rialto:initial'
  AND map_id = 'map.rialto'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-95.624,12.66,-5.541],[-61.87,10.87,5.36],[-38.68,12.75,-22.136],[-20.44,12.17,-15.13],[26.871,7.01,2.468],[53.82,12.86,10.55],[33.75,5.54,48.5]],"resetPosition":[-115.01,4.5,-46.01],"endPosition":[47.956,5.2,47.318],"thirdPersonPosition":[-115.228,5.799,-49.59],"creditsPosition":[-113.27,7.5,-63.14],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.route66:initial'
  AND map_id = 'map.route66'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[70.39,7.86,24.73],[40.8,4.01,5.96],[61.26,5.99,-16.04],[0.08,8.34,83.49],[-25.99,1.21,15.51],[-43.32,4,36.5],[-71.28,14.62,38.58],[-93.05,7.06,18.11]],"resetPosition":[111.34,7.09,-5.6],"endPosition":[-106.93,7.99,22.24],"thirdPersonPosition":[113.31,7.09,-3.5],"creditsPosition":[124.6,8.77,-15.99],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.runasapi:initial'
  AND map_id = 'map.runasapi'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-408.95,14.4,-84.76],[-384.05,12.05,-86.88],[-330.08,10.01,-98.04],[-276.43,11.02,-89.16],[307.13,18.61,-206.17],[231.6,16.28,-270.76],[233.69,9,-229.7],[170.96,12.56,-242.33],[97.68,340.63,397.23],[46.64,345.49,387.04],[26.69,341.63,376.43],[27.74,360.5,356.07],[0.96,346.65,390.11],[-4.4,353.05,407.42]],"resetPosition":[-430.71,10.3,-105.96],"endPosition":[-29.3,340.56,410.76],"thirdPersonPosition":[-425.32,10.23,-116.48],"creditsPosition":[-436.16,12.2,-111.37],"control":{"centerPositions":[],"jumpPositions":[[-256.82,14.85,-94.9],[177.52,12.3,-239.3]],"respawnPositions":[[-428,10.5,-109],[330.12,14.64,-216.31],[107.83,343,415.6]],"respawnAxis":"x","respawnAxisThreshold":40},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.samoa:initial'
  AND map_id = 'map.samoa'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-16.139,40.508,181.288],[-44.29,40.509,203.816],[-13.976,29.775,143.323],[-50.623,27.354,113.051],[-10.115,37.04,130.901],[-4.849,14,61.562],[-16.627,9.917,13.463],[16.27,20.587,99.534],[-38.962,16.615,69.858],[26.033,9.149,19.823],[-9.824,8.001,-21.875]],"resetPosition":[-1.97,31.07,221.85],"endPosition":[-19.43,8,-22.02],"thirdPersonPosition":[-7.69,31.07,226.97],"creditsPosition":[1.75,35,232.5],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.shambali_monastery:initial'
  AND map_id = 'map.shambali_monastery'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[16.734,10.5,72.11],[-33.04,4.174,73.197],[-0.913,5.25,62.388],[24.538,9.284,4.699],[23.629,7.986,36.324],[-63.158,8.431,13.99],[-20.737,4.005,18.929],[-2.818,3.976,-36.071],[-20.587,4.008,-19.155]],"resetPosition":[-4.55,4,124.39],"endPosition":[-2.43,4.13,0.75],"thirdPersonPosition":[5.54,4,124.39],"creditsPosition":[0.68,11.77,120.02],"control":{"centerPositions":[],"jumpPositions":[],"respawnPositions":[[-0.36,4,136.68]],"respawnAxis":"z","respawnAxisThreshold":50},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.suravasa:initial'
  AND map_id = 'map.suravasa'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-17.188,11.237,105.646],[-3.47,20.35,97.61],[-4.69,22.57,79.47],[-37.62,1.91,47.85],[-25.2,1.07,25.16],[-37.5,16.8,-4.79],[-0.35,17.87,-24.21]],"resetPosition":[-17.16,4.46,137.76],"endPosition":[-7.02,-0.66,-36.43],"thirdPersonPosition":[-7.969,4.701,137.39],"creditsPosition":[-11.3,7.35,149.11],"control":null,"portalPositions":[],"springboardPositions":[[-47.93,1.5,51.33]],"alternateStages":[]}'
WHERE id = 'revision:map.temple_of_anubis:initial'
  AND map_id = 'map.temple_of_anubis'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-28.955,6.079,65.912],[23.873,21.939,104.507],[0.457,10.482,97.234],[-7.399,7.583,50.502],[-1.101,1.051,19.039],[11.358,8.052,-15.668],[-25.866,9.142,-44.072],[11.875,7.904,-24.293],[-27.944,5.78,-83.352],[-16.021,5.815,-98.212]],"resetPosition":[6.28,9.28,130.05],"endPosition":[-10.49,8.92,-125.57],"thirdPersonPosition":[3.18,9.28,130.71],"creditsPosition":[-157.98,-90.95,-89.77],"control":{"centerPositions":[],"jumpPositions":[],"respawnPositions":[[11.4,9.25,134.12]],"respawnAxis":"z","respawnAxisThreshold":30},"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.throne_of_anubis:initial'
  AND map_id = 'map.throne_of_anubis'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-72.477,16.869,47.82],[-68.159,2.02,82.854],[-29.458,2.097,77.543],[-39.212,-2.064,80.626],[-82.963,-0.157,22.991],[-13.924,-2.98,117.617],[-28.688,2.803,35.54],[-38.633,-1.459,38.463]],"resetPosition":[-115.18,-1.98,35.24],"endPosition":[-40.94,2.95,38.35],"thirdPersonPosition":[-113.051,-1.98,31.996],"creditsPosition":[-128.25,0.5,24.75],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.volskaya:initial'
  AND map_id = 'map.volskaya'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[70.099,9,26.803],[86.26,7.46,2.95],[61.64,3.67,-20.79],[46.95,7.65,-66.08],[32.69,4.69,-52.38],[21,4.2,-64.39],[31.85,7.62,-107.88],[56.88,9.23,-118.92],[18.08,8.78,-133.02]],"resetPosition":[97.55,1.06,60.38],"endPosition":[43.42,5.15,-129.34],"thirdPersonPosition":[93.88,1.06,63.17],"creditsPosition":[112.23,0,73.59],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.watchpoint_gibraltar:initial'
  AND map_id = 'map.watchpoint_gibraltar'
  AND spatial_config_json IS NULL;

-- Eichenwalde's existing engine variant is a selectable revision. It copies
-- configuration only; no submissions, mastery runs, or title grants are copied.
INSERT OR IGNORE INTO gameplay_revisions (
  id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id,
  reset_reason, game_version, created_at, updated_at
)
SELECT
  'revision:map.eichenwalde:v0', source.map_id, 'selectable', 'classic', source.id,
  NULL, source.game_version, source.created_at, source.updated_at
FROM gameplay_revisions AS source
INNER JOIN maps AS map ON map.id = source.map_id
WHERE source.id = 'revision:map.eichenwalde:initial'
  AND source.map_id = 'map.eichenwalde'
  AND map.status = 'active';

INSERT OR IGNORE INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:revision:map.eichenwalde:v0:' || source_assignment.challenge_family || ':' || source_assignment.challenge_id,
  target.id, source_assignment.map_id, source_assignment.challenge_family, source_assignment.challenge_id, source_assignment.enabled,
  source_assignment.condition, source_assignment.evidence_rule, source_assignment.submission_mode, source_assignment.slot,
  source_assignment.created_at, source_assignment.updated_at
FROM gameplay_revision_challenge_assignments AS source_assignment
INNER JOIN gameplay_revisions AS source ON source.id = source_assignment.gameplay_revision_id
INNER JOIN gameplay_revisions AS target ON target.id = 'revision:map.eichenwalde:v0'
WHERE source.id = 'revision:map.eichenwalde:initial'
  AND source_assignment.map_id = 'map.eichenwalde';

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[105.65,15.95,14.28],[56.16,18.97,21.78],[12.3,13.18,-27.04],[-28.93,11,-3.85],[-14.51,8,-34.71],[-62.89,13.3,-45.44],[-46.18,4.22,-69.18]],"resetPosition":[129.68,10,0.04],"endPosition":[-76.75,4.03,-74.17],"thirdPersonPosition":[135.08,10,-3.31],"creditsPosition":[147.52,11.5,-10.9],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.circuit_royal:v0'
  AND map_id = 'map.circuit_royal'
  AND lifecycle = 'selectable'
  AND legacy_map_variant = 'classic'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[115.78,14.732,-29.038],[119.48,18.855,-43.12],[54.429,23.32,-102.936],[75.164,12.66,-71.852],[36.49,8.938,-71.14],[3.66,9.08,-62.94],[-12.503,3.514,-31.548],[0.632,6.073,-2.154],[-32.381,-1.334,0.005],[70.234,18.381,-65.979],[8.544,10.396,-42.598]],"resetPosition":[128.06,10.72,1.84],"endPosition":[-26.72,1.97,-34.09],"thirdPersonPosition":[131.335,10.72,1.098],"creditsPosition":[132.82,13.72,9.04],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.eichenwalde:v0'
  AND map_id = 'map.eichenwalde'
  AND lifecycle = 'selectable'
  AND legacy_map_variant = 'classic'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-15.46,9.68,-89.3],[1.87,5,-41.04],[-6.95,8.01,-10.86],[27,0,-7.87],[34.66,6,16.47],[63.63,6,-11.98]],"resetPosition":[-46.98,1,-101.54],"endPosition":[72.38,-1.96,-0.16],"thirdPersonPosition":[-33.2,1,-115.04],"creditsPosition":[-48.1,2.5,-116.08],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.hanamura:v0'
  AND map_id = 'map.hanamura'
  AND lifecycle = 'selectable'
  AND legacy_map_variant = 'classic'
  AND spatial_config_json IS NULL;

UPDATE gameplay_revisions
SET spatial_config_json = '{"bastionPositions":[[-95.984,13.454,-83.535],[-72.132,11.976,-44.042],[-41.725,13.99,-2.92],[20,10.03,-38.5],[-14.721,14.25,-35.219],[0.211,10.174,-60.874]],"resetPosition":[-115.03,15.97,-122.82],"endPosition":[9.563,8.329,-59.98],"thirdPersonPosition":[-109.263,15.3,-111.151],"creditsPosition":[-119.74,19,-132.45],"control":null,"portalPositions":[],"springboardPositions":[],"alternateStages":[]}'
WHERE id = 'revision:map.paris:v0'
  AND map_id = 'map.paris'
  AND lifecycle = 'selectable'
  AND legacy_map_variant = 'classic'
  AND spatial_config_json IS NULL;
