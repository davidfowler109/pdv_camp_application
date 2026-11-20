ALTER TABLE staff_application_document DROP CONSTRAINT IF EXISTS staff_application_document_category_check;
ALTER TABLE staff_application_document ADD CONSTRAINT staff_application_document_category_check CHECK(category IN ('reference','guardian','policy','background','rules'));
