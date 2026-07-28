ALTER TABLE title_catalog ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE title_catalog ADD COLUMN color_json TEXT NOT NULL DEFAULT 'null';

UPDATE title_catalog SET sort_order = CASE key
  WHEN 'PIONEER' THEN 0 WHEN 'TEST_LONG' THEN 1 WHEN 'NOT_MY_MAP' THEN 2 WHEN 'WILD_DEV' THEN 3
  WHEN 'ARCHITECT' THEN 4 WHEN 'MAINTAINER' THEN 5 WHEN 'THREE_IN_ONE' THEN 6 WHEN 'BLACK_SHEEP' THEN 7
  WHEN 'PURE_HARM' THEN 8 WHEN 'CONQUEROR' THEN 9 WHEN 'DOMINATOR' THEN 10 WHEN 'SURVIVOR_EXPERT' THEN 11
  WHEN 'CHALLENGER_LEGEND' THEN 12 WHEN 'TRAVELER_HELL' THEN 13 WHEN 'DODGE_ULTIMATE' THEN 14 WHEN 'LIGHT_PACK' THEN 15
  WHEN 'FLAWLESS' THEN 16 WHEN 'NEVER_GIVE_UP' THEN 17 WHEN 'PERSEVERANCE' THEN 18 WHEN 'SPEEDRUN' THEN 19
  WHEN 'DODGE_GOD' THEN 20 WHEN 'ZENYATTA' THEN 21 WHEN 'HARD_TO_KILL' THEN 22 WHEN 'WIN_HEAVEN' THEN 23
  WHEN 'IDOL' THEN 24 WHEN 'EGG_FIRST' THEN 25 WHEN 'EAT_MORE' THEN 26 WHEN 'ALL_IN_ONE' THEN 27
  WHEN 'TRAVELER' THEN 28 WHEN 'SKY' THEN 29 WHEN 'FLAME' THEN 30 WHEN 'PASS_EGGS' THEN 31
  WHEN 'CHOSEN' THEN 32 WHEN 'LUCKY_STAR' THEN 33 WHEN 'GAMBLE_KING' THEN 34 WHEN 'LUCKY_SHINE' THEN 35
  WHEN 'UNLUCKY' THEN 36 WHEN 'MANBA' THEN 37 WHEN 'MY_FATE' THEN 38 WHEN 'GOD_GAMBLER' THEN 39
  WHEN 'LAO_DA' THEN 40 WHEN 'V_50' THEN 41 WHEN 'STEEL' THEN 42 WHEN 'HACKING' THEN 43
  WHEN 'RED_PACKET' THEN 44 WHEN 'GOOD_LUCK' THEN 45 WHEN 'LONE_WALKER' THEN 46 WHEN 'GREEN_MOUNTAIN' THEN 47
  WHEN 'SUAN_BU_LA' THEN 48 WHEN 'EVENT5_GAMBLE_SAINT' THEN 49 WHEN 'EVENT5_BLACK_SHEEP' THEN 50
  WHEN 'EVENT5_I_WANT_TO_CHECK_CARDS' THEN 51 WHEN 'EVENT5_CARDS_ARE_FINE' THEN 52 WHEN 'GREAT_BENEFACTOR' THEN 53
  WHEN 'BREAK_ATMOSPHERE' THEN 54 WHEN 'LIST_THEM' THEN 55 WHEN 'LIFE_GUARDS_LIFE' THEN 56 WHEN 'PHANTOM_THIEF' THEN 57
  ELSE 100000
END;

UPDATE title_catalog SET color_json = CASE key
  WHEN 'PIONEER' THEN '{"kind":"heroColor","index":12}'
  WHEN 'CONQUEROR' THEN '{"kind":"heroColor","index":43}'
  WHEN 'DOMINATOR' THEN '{"kind":"heroColor","index":44}'
  WHEN 'SURVIVOR_EXPERT' THEN '{"kind":"rgb","value":[236,153,0]}'
  WHEN 'CHALLENGER_LEGEND' THEN '{"kind":"rgb","value":[200,0,19]}'
  WHEN 'TRAVELER_HELL' THEN '{"kind":"rgb","value":[161,73,197]}'
  WHEN 'DODGE_ULTIMATE' THEN '{"kind":"heroColor","index":1}'
  WHEN 'LIGHT_PACK' THEN '{"kind":"heroColor","index":2}'
  WHEN 'FLAWLESS' THEN '{"kind":"rgb","value":[0,230,151]}'
  WHEN 'NEVER_GIVE_UP' THEN '{"kind":"rgb","value":[0,230,151]}'
  WHEN 'PERSEVERANCE' THEN '{"kind":"rgb","value":[255,255,255]}'
  WHEN 'SPEEDRUN' THEN '{"kind":"rgb","value":[0,230,151]}'
  WHEN 'DODGE_GOD' THEN '{"kind":"heroColor","index":28}'
  WHEN 'ZENYATTA' THEN '{"kind":"heroColor","index":12}'
  WHEN 'HARD_TO_KILL' THEN '{"kind":"heroColor","index":45}'
  WHEN 'WIN_HEAVEN' THEN '{"kind":"palette","name":"orange"}'
  WHEN 'IDOL' THEN '{"kind":"rgb","value":[200,0,19]}'
  WHEN 'EGG_FIRST' THEN '{"kind":"rgb","value":[200,0,19]}'
  WHEN 'EAT_MORE' THEN '{"kind":"rgb","value":[238,75,43]}'
  WHEN 'ALL_IN_ONE' THEN '{"kind":"palette","name":"red"}'
  WHEN 'TRAVELER' THEN '{"kind":"heroColor","index":33}'
  WHEN 'SKY' THEN '{"kind":"palette","name":"purple"}'
  WHEN 'FLAME' THEN '{"kind":"heroColor","index":28}'
  WHEN 'PASS_EGGS' THEN '{"kind":"heroColor","index":28}'
  WHEN 'CHOSEN' THEN '{"kind":"heroColor","index":11}'
  WHEN 'LUCKY_STAR' THEN '{"kind":"heroColor","index":3}'
  WHEN 'GAMBLE_KING' THEN '{"kind":"palette","name":"gold"}'
  WHEN 'LUCKY_SHINE' THEN '{"kind":"heroColor","index":32}'
  WHEN 'UNLUCKY' THEN '{"kind":"heroColor","index":22}'
  WHEN 'MANBA' THEN '{"kind":"heroColor","index":11}'
  WHEN 'MY_FATE' THEN '{"kind":"palette","name":"blue"}'
  WHEN 'GOD_GAMBLER' THEN '{"kind":"palette","name":"gold"}'
  WHEN 'V_50' THEN '{"kind":"heroColor","index":37}'
  WHEN 'STEEL' THEN '{"kind":"heroColor","index":11}'
  WHEN 'HACKING' THEN '{"kind":"heroColor","index":20}'
  WHEN 'RED_PACKET' THEN '{"kind":"heroColor","index":43}'
  WHEN 'GOOD_LUCK' THEN '{"kind":"palette","name":"gold"}'
  WHEN 'LONE_WALKER' THEN '{"kind":"heroColor","index":33}'
  WHEN 'GREEN_MOUNTAIN' THEN '{"kind":"rgb","value":[0,200,50]}'
  WHEN 'SUAN_BU_LA' THEN '{"kind":"heroColor","index":18}'
  WHEN 'EVENT5_GAMBLE_SAINT' THEN '{"kind":"palette","name":"gold"}'
  WHEN 'EVENT5_BLACK_SHEEP' THEN '{"kind":"heroColor","index":3}'
  WHEN 'EVENT5_I_WANT_TO_CHECK_CARDS' THEN '{"kind":"heroColor","index":3}'
  WHEN 'EVENT5_CARDS_ARE_FINE' THEN '{"kind":"heroColor","index":3}'
  WHEN 'GREAT_BENEFACTOR' THEN '{"kind":"rgb","value":[0,200,50]}'
  WHEN 'BREAK_ATMOSPHERE' THEN '{"kind":"rgb","value":[192,192,192]}'
  WHEN 'LIST_THEM' THEN '{"kind":"palette","name":"gold"}'
  WHEN 'LIFE_GUARDS_LIFE' THEN '{"kind":"heroColor","index":28}'
  WHEN 'PHANTOM_THIEF' THEN '{"kind":"heroColor","index":22}'
  ELSE 'null'
END;
