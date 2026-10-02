CREATE TABLE "ServiceRegionState" (
  "uf" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRegionState_pkey" PRIMARY KEY ("uf")
);

CREATE TABLE "ServiceRegionMunicipality" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "stateUf" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRegionMunicipality_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRegionMunicipality_stateUf_name_key"
  ON "ServiceRegionMunicipality"("stateUf", "name");
CREATE INDEX "ServiceRegionMunicipality_stateUf_enabled_idx"
  ON "ServiceRegionMunicipality"("stateUf", "enabled");

ALTER TABLE "ServiceRegionMunicipality"
  ADD CONSTRAINT "ServiceRegionMunicipality_stateUf_fkey"
  FOREIGN KEY ("stateUf") REFERENCES "ServiceRegionState"("uf")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ServiceRegionState" ("uf", "name", "enabled") VALUES
  ('AC', 'Acre', false),
  ('AL', 'Alagoas', false),
  ('AP', 'Amapá', false),
  ('AM', 'Amazonas', false),
  ('BA', 'Bahia', false),
  ('CE', 'Ceará', false),
  ('DF', 'Distrito Federal', false),
  ('ES', 'Espírito Santo', false),
  ('GO', 'Goiás', false),
  ('MA', 'Maranhão', false),
  ('MT', 'Mato Grosso', false),
  ('MS', 'Mato Grosso do Sul', false),
  ('MG', 'Minas Gerais', false),
  ('PA', 'Pará', false),
  ('PB', 'Paraíba', false),
  ('PR', 'Paraná', false),
  ('PE', 'Pernambuco', false),
  ('PI', 'Piauí', false),
  ('RJ', 'Rio de Janeiro', false),
  ('RN', 'Rio Grande do Norte', false),
  ('RS', 'Rio Grande do Sul', false),
  ('RO', 'Rondônia', false),
  ('RR', 'Roraima', false),
  ('SC', 'Santa Catarina', false),
  ('SP', 'São Paulo', true),
  ('SE', 'Sergipe', false),
  ('TO', 'Tocantins', false);

INSERT INTO "ServiceRegionMunicipality" ("id", "name", "stateUf", "enabled")
VALUES ('service-region-aguas-de-lindoia-sp', 'Águas de Lindóia', 'SP', true);
