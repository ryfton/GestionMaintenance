-- A executer dans Supabase avant d'activer la validation dans l'interface.
-- Conserve les historiques existants et ne modifie aucune politique RLS.
begin;

alter table public.historique_maintenances
  add column if not exists maintenance_systematique_id uuid
    references public.maintenance_systematique(id) on delete restrict,
  add column if not exists echeance_planifiee date;

create unique index if not exists historique_maintenance_echeance_unique
  on public.historique_maintenances(maintenance_systematique_id, echeance_planifiee)
  where maintenance_systematique_id is not null;

create or replace function public.on_historique_maintenances_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  plan public.maintenance_systematique%rowtype;
  candidate date;
  previous_candidate date;
  changed_count integer;
begin
  -- Une realisation manuelle ne reporte plus les autres programmations.
  if new.maintenance_systematique_id is null then
    if new.echeance_planifiee is not null then
      raise exception 'Une echeance planifiee exige une programmation liee.';
    end if;
    return new;
  end if;

  select * into plan
  from public.maintenance_systematique
  where id = new.maintenance_systematique_id
  for update;

  if not found then
    raise exception 'Programmation introuvable ou non autorisee.';
  end if;
  if plan.installation_id is distinct from new.installation_id then
    raise exception 'La programmation ne correspond pas a cette installation.';
  end if;
  if plan.type_maintenance is distinct from new.type_maintenance then
    raise exception 'Le type de maintenance ne correspond pas a la programmation.';
  end if;
  if new.date_intervention is null or new.date_intervention > current_date then
    raise exception 'La date de realisation doit etre renseignee et ne peut pas etre future.';
  end if;
  if new.duree_minutes is null or new.duree_minutes < 0 then
    raise exception 'La duree doit etre positive ou nulle.';
  end if;
  if plan.date_prochaine_intervention is null
     or new.echeance_planifiee is distinct from plan.date_prochaine_intervention then
    raise exception 'Echeance modifiee ou deja validee : rechargez la programmation.';
  end if;

  candidate := plan.date_prochaine_intervention;
  loop
    previous_candidate := candidate;
    candidate := public._advance_by_period(candidate, plan.periodicite);
    if candidate is null or candidate <= previous_candidate then
      raise exception 'Periodicite invalide : aucune echeance reportee.';
    end if;
    exit when candidate > greatest(new.date_intervention, plan.date_prochaine_intervention);
  end loop;

  update public.maintenance_systematique
  set date_prochaine_intervention = candidate, updated_at = now()
  where id = plan.id;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Report refuse par les droits d acces : validation annulee.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hist_maint_insert on public.historique_maintenances;
create trigger trg_hist_maint_insert
before insert on public.historique_maintenances
for each row execute function public.on_historique_maintenances_insert();

commit;
