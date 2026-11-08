-- Secure, transactional publishing for the randomized full-season schedule.
-- Run in Supabase SQL Editor as the project owner.
CREATE OR REPLACE FUNCTION public.publish_season_schedule(
  p_season_id uuid,
  p_schedule jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_discipline text;
  v_matchup_id uuid;
  v_count integer := 0;
  v_p1 uuid;
  v_p2 uuid;
  v_week integer;
  v_deadline timestamptz;
  v_disciplines jsonb;
BEGIN
  IF NOT public.is_league_admin() THEN
    RAISE EXCEPTION 'Only league administrators can publish schedules';
  END IF;
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' OR jsonb_array_length(p_schedule) = 0 THEN
    RAISE EXCEPTION 'Schedule must contain at least one matchup';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION 'Season not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matchups WHERE season_id = p_season_id) THEN
    RAISE EXCEPTION 'This season already has matchups. Existing schedules will not be overwritten.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_schedule)
  LOOP
    v_p1 := (v_item->>'player1_id')::uuid;
    v_p2 := (v_item->>'player2_id')::uuid;
    v_week := (v_item->>'week_number')::integer;
    v_deadline := (v_item->>'deadline')::timestamptz;
    v_disciplines := v_item->'disciplines';

    IF v_p1 = v_p2 OR v_week < 1 OR v_deadline IS NULL THEN
      RAISE EXCEPTION 'Invalid matchup details in week %', v_week;
    END IF;
    IF (SELECT count(*) FROM public.profiles WHERE id IN (v_p1, v_p2) AND role = 'player') <> 2 THEN
      RAISE EXCEPTION 'Both matchup participants must be registered players';
    END IF;
    IF jsonb_typeof(v_disciplines) <> 'array' OR jsonb_array_length(v_disciplines) <> 3 THEN
      RAISE EXCEPTION 'Every matchup must contain exactly three disciplines';
    END IF;
    IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_disciplines)) <> 3
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_disciplines) d(value)
         WHERE d.value NOT IN ('Ping Pong','Darts','Pool','Air Hockey')
       ) THEN
      RAISE EXCEPTION 'Each matchup must use three different valid disciplines';
    END IF;

    INSERT INTO public.matchups(season_id, week_number, player1_id, player2_id, deadline, status)
    VALUES (p_season_id, v_week, v_p1, v_p2, v_deadline, 'scheduled')
    RETURNING id INTO v_matchup_id;

    FOR v_discipline IN SELECT value FROM jsonb_array_elements_text(v_disciplines)
    LOOP
      INSERT INTO public.games(matchup_id, discipline) VALUES (v_matchup_id, v_discipline);
    END LOOP;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_season_schedule(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_season_schedule(uuid, jsonb) TO authenticated;
