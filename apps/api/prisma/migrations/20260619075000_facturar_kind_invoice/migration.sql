-- El paso "facturar" usa el panel de facturación (kind=invoice), en plantilla e instancias.
UPDATE "workflow_task_templates" SET "kind" = 'invoice' WHERE "code" = 'facturar';
UPDATE "shipment_tasks" SET "kind" = 'invoice' WHERE "code" = 'facturar';
