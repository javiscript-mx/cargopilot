-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "workflowTemplateId" TEXT;

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operationType" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stage_templates" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "workflow_stage_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_task_templates" (
    "id" TEXT NOT NULL,
    "stageTemplateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "responsibleRole" TEXT,
    "responsibleSupplierType" TEXT,
    "requiredDocs" TEXT[],

    CONSTRAINT "workflow_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leg_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leg_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leg_task_templates" (
    "id" TEXT NOT NULL,
    "legTemplateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'any',
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "responsibleRole" TEXT,
    "responsibleSupplierType" TEXT,
    "requiredDocs" TEXT[],

    CONSTRAINT "leg_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_stages" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "stageTemplateId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "shipment_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_tasks" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "taskTemplateId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigneeUserId" TEXT,
    "supplierId" TEXT,
    "requiredDocs" TEXT[],
    "plannedAt" TIMESTAMP(3),
    "actualAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_legs" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legTemplateId" TEXT,
    "order" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'foraneo',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "origin" JSONB,
    "destination" JSONB,
    "distanceKm" DECIMAL(10,2),
    "carrierSupplierId" TEXT,
    "vehicleId" TEXT,
    "operatorId" TEXT,
    "plannedPickupAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "plannedDeliveryAt" TIMESTAMP(3),
    "actualDeliveryAt" TIMESTAMP(3),
    "cartaPorteInvoiceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leg_tasks" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "taskTemplateId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigneeUserId" TEXT,
    "supplierId" TEXT,
    "requiredDocs" TEXT[],
    "plannedAt" TIMESTAMP(3),
    "actualAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leg_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_code_key" ON "workflow_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stage_templates_templateId_code_key" ON "workflow_stage_templates"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_task_templates_stageTemplateId_code_key" ON "workflow_task_templates"("stageTemplateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leg_templates_code_key" ON "leg_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leg_task_templates_legTemplateId_code_key" ON "leg_task_templates"("legTemplateId", "code");

-- CreateIndex
CREATE INDEX "shipment_stages_shipmentId_idx" ON "shipment_stages"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_tasks_shipmentId_idx" ON "shipment_tasks"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_tasks_stageId_idx" ON "shipment_tasks"("stageId");

-- CreateIndex
CREATE INDEX "shipment_legs_shipmentId_idx" ON "shipment_legs"("shipmentId");

-- CreateIndex
CREATE INDEX "leg_tasks_legId_idx" ON "leg_tasks"("legId");

-- CreateIndex
CREATE INDEX "leg_tasks_shipmentId_idx" ON "leg_tasks"("shipmentId");

-- AddForeignKey
ALTER TABLE "workflow_stage_templates" ADD CONSTRAINT "workflow_stage_templates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_task_templates" ADD CONSTRAINT "workflow_task_templates_stageTemplateId_fkey" FOREIGN KEY ("stageTemplateId") REFERENCES "workflow_stage_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leg_task_templates" ADD CONSTRAINT "leg_task_templates_legTemplateId_fkey" FOREIGN KEY ("legTemplateId") REFERENCES "leg_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stages" ADD CONSTRAINT "shipment_stages_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_tasks" ADD CONSTRAINT "shipment_tasks_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "shipment_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_legs" ADD CONSTRAINT "shipment_legs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leg_tasks" ADD CONSTRAINT "leg_tasks_legId_fkey" FOREIGN KEY ("legId") REFERENCES "shipment_legs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
