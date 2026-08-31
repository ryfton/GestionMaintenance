-- RPC: consommer plusieurs articles atomiquement

create or replace function public.consume_articles_for_intervention(
  p_intervention_id bigint,
  p_items jsonb,
  p_user text
) returns void language plpgsql as $$
declare
  item jsonb;
  a_id bigint;
  q numeric;
  cur_qty numeric;
begin
  if p_items is null then return; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    a_id := (item->>'article_id')::bigint;
    q := (item->>'quantite')::numeric;
    -- vérifier stock
    select quantite into cur_qty from articles where id = a_id for update;
    if cur_qty is null then raise exception 'Article % introuvable', a_id; end if;
    if cur_qty < q then raise exception 'Stock insuffisant pour article %', a_id; end if;
    -- décrémenter
    update articles set quantite = quantite - q, updated_at = now() where id = a_id;
    -- insérer usage
    insert into intervention_articles(intervention_id, article_id, quantite_utilisee, prix_unitaire, created_by, created_at)
      select p_intervention_id, a_id, q, prix_unitaire, p_user, now() from articles where id = a_id;
    -- historique
    insert into historique_stock(article_id, changement, raison, reference_intervention_id, created_by, created_at)
      values (a_id, -q, 'Utilisation intervention', p_intervention_id, p_user, now());
  end loop;
end;
$$;
