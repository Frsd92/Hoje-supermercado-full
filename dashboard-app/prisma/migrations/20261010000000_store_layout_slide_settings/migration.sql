CREATE TABLE "StoreLayoutSlideSettings" (
  "key" TEXT NOT NULL,
  "showLogo" BOOLEAN NOT NULL DEFAULT false,
  "showText" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "showButton" BOOLEAN NOT NULL DEFAULT false,
  "buttonLabel" TEXT NOT NULL DEFAULT 'Ver ofertas',
  "buttonHref" TEXT NOT NULL DEFAULT '#store-offers',
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreLayoutSlideSettings_pkey" PRIMARY KEY ("key")
);
