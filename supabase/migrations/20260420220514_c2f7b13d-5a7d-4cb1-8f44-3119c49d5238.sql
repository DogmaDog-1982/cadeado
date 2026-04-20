
CREATE OR REPLACE FUNCTION public.create_game(_name text, _secret integer[])
RETURNS TABLE(id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  new_code text;
  attempts int := 0;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  placeholder integer[] := ARRAY[0,0,0,0];
BEGIN
  IF _name IS NULL OR length(_name) < 1 OR length(_name) > 30 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF array_length(_secret, 1) <> 4 THEN
    RAISE EXCEPTION 'secret must have 4 digits';
  END IF;

  LOOP
    new_code := '';
    FOR i IN 1..5 LOOP
      new_code := new_code || substr(chars, floor(random()*length(chars))::int + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.games (code, player1_name, player1_secret, player2_secret)
      VALUES (new_code, _name, _secret, placeholder)
      RETURNING games.id INTO new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT new_id, new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text, integer[]) TO anon, authenticated;
