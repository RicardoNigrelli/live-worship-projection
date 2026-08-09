-- Migración aditiva: anotaciones personales de músicos en /stage
-- Generada con: prisma migrate diff (schema previo -> schema nuevo)
--
-- SEGURO PARA PRODUCCIÓN: solo CREATE TABLE / CREATE INDEX / ADD FOREIGN KEY.
-- No hay ningún DROP ni ALTER sobre tablas existentes: nada se borra ni se modifica.
-- Aplicar con: psql "<DATABASE_URL>" -f 2026-07-24_stage_annotations.sql
-- (o pegarlo en el SQL editor de Neon).

-- CreateTable
CREATE TABLE "SingerProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SingerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageAnnotation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "role" TEXT,
    "note" TEXT,
    "parts" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSongMeta" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "keyLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSongMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageAnnotation_profileId_serviceId_songId_key" ON "StageAnnotation"("profileId", "serviceId", "songId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSongMeta_serviceId_songId_key" ON "ServiceSongMeta"("serviceId", "songId");

-- AddForeignKey
ALTER TABLE "StageAnnotation" ADD CONSTRAINT "StageAnnotation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SingerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
