-- migrations/2026-10-15_create_installations.sql
-- Crée les tables installations, maintenance_systematique, historique_maintenances
-- Crée les fonctions et le trigger pour avancer automatiquement date_prochaine_intervention

-- 0) Extension (nécessaire pour gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tables
CREATE TABLE IF NOT EXISTS installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  type_equipement TEXT NOT NULL,
  localisation TEXT,
  departement TEXT,
  date_installation DATE,
  responsable TEXT,
  etat TEXT DEFAULT 'ACTIF' CHECK (etat IN ('ACTIF', 'ARRETE', 'EN_MAINTENANCE')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_systematique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  type_maintenance TEXT NOT NULL CHECK (type_maintenance IN ('PREVENTIVE', 'CORRECTIVE', 'CURATIVE')),
  periodicite TEXT NOT NULL CHECK (periodicite IN ('HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL')),
  description TEXT,
  date_prochaine_intervention DATE,
  responsable_planification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historique_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  type_maintenance TEXT NOT NULL CHECK (type_maintenance IN ('PREVENTIVE', 'CORRECTIVE', 'CURATIVE')),
  date_intervention DATE NOT NULL,
  description_intervention TEXT,
  constat TEXT,
  pieces_changees TEXT,
  technicien_id UUID,
  duree_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes utiles
CREATE INDEX IF NOT EXISTS idx_installations_etat ON installations(etat);
CREATE INDEX IF NOT EXISTS idx_maintenance_systematique_installation_id ON maintenance_systematique(installation_id);
CREATE INDEX IF NOT EXISTS idx_historique_maintenances_installation_id ON historique_maintenances(installation_id);

-- 2) Fonction utilitaire : avance une date selon périodicité
CREATE OR REPLACE FUNCTION public._advance_by_period(p_date date, p_periodicite text)
RETURNS date
LANGUAGE plpgsql AS $$
DECLARE
  next_date date := p_date;
BEGIN
  CASE p_periodicite
    WHEN 'HEBDOMADAIRE' THEN next_date := p_date + INTERVAL '7 days';
    WHEN 'MENSUEL' THEN next_date := p_date + INTERVAL '1 month';
    WHEN 'TRIMESTRIEL' THEN next_date := p_date + INTERVAL '3 months';
    WHEN 'SEMESTRIEL' THEN next_date := p_date + INTERVAL '6 months';
    WHEN 'ANNUEL' THEN next_date := p_date + INTERVAL '1 year';
    ELSE
      next_date := p_date;
  END CASE;
  RETURN next_date;
END;
$$;

-- 3) Fonction trigger : après insertion d'une intervention, avancer la/les date_prochaine_intervention liées
CREATE OR REPLACE FUNCTION public.on_historique_maintenances_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  candidate date;
BEGIN
  FOR rec IN
    SELECT * FROM maintenance_systematique
    WHERE installation_id = NEW.installation_id
  LOOP
    candidate := rec.date_prochaine_intervention;

    IF candidate IS NULL THEN
      -- si pas de date_prochaine_intervention définie, propose la prochaine date après l'intervention
      candidate := _advance_by_period(NEW.date_intervention, rec.periodicite);
    ELSE
      -- avancer la date tant qu'elle est <= date d'intervention
      WHILE candidate <= NEW.date_intervention LOOP
        candidate := _advance_by_period(candidate, rec.periodicite);
      END LOOP;
    END IF;

    UPDATE maintenance_systematique
    SET date_prochaine_intervention = candidate,
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4) Trigger
DROP TRIGGER IF EXISTS trg_hist_maint_insert ON historique_maintenances;
CREATE TRIGGER trg_hist_maint_insert
AFTER INSERT ON historique_maintenances
FOR EACH ROW
EXECUTE FUNCTION public.on_historique_maintenances_insert();
