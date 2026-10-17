-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CRM', 'HOD', 'REG_REVIEWER', 'SECTION_APPROVER', 'ANALYST', 'STORES', 'ACCOUNTS', 'SIGNATORY');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('PHONE', 'MAIL', 'WALK_IN', 'REFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'IN_DISCUSSION', 'QUOTATION_PREPARED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GstType" AS ENUM ('INTRA', 'INTER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('AWAITING_SAMPLE', 'RECEIVED', 'PRE_REGISTERED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "DispatchMode" AS ENUM ('COURIER', 'HAND_DELIVERY', 'EMAIL', 'POST');

-- CreateEnum
CREATE TYPE "RegistrationTemplate" AS ENUM ('PHARMA', 'MECH', 'OM', 'GEN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PRE_REGISTERED', 'REGISTERED', 'IN_TESTING', 'TESTING_COMPLETE', 'REPORTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SectionWorkStatus" AS ENUM ('PENDING', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_TESTING', 'SUBMITTED', 'CORRECTION_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FINAL_RESULT', 'MULTI_VALUE', 'INSTRUMENT', 'VALIDATION');

-- CreateEnum
CREATE TYPE "Conformity" AS ENUM ('COMPLIES', 'DOES_NOT_COMPLY');

-- CreateEnum
CREATE TYPE "ChemicalKind" AS ENUM ('CHEMICAL', 'STANDARD', 'REFERENCE_STANDARD', 'MEDIA', 'REAGENT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PREVIEW', 'RELEASED', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('STANDARD', 'VALIDATION');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DISPATCHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('IN_STORE', 'RETENTION_ACTIVE', 'DUE_FOR_DISPOSAL', 'DISPOSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'ISSUED', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxRelaxation" AS ENUM ('NONE', 'SEZ_LUT', 'EXPORT_LUT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('SUBMIT', 'RETURN', 'APPROVE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "designation" TEXT,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "UserSection" (
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "UserSection_pkey" PRIMARY KEY ("userId","sectionId")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "series" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("series","period")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formula" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "displayExpression" TEXT,
    "variables" JSONB NOT NULL,
    "resultUnit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestMaster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT,
    "rate" DECIMAL(12,2) NOT NULL,
    "nablAccredited" BOOLEAN NOT NULL DEFAULT false,
    "reportType" "ReportType" NOT NULL DEFAULT 'FINAL_RESULT',
    "replicates" INTEGER NOT NULL DEFAULT 1,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "formulaId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "sectionId" TEXT,
    "calibrationDue" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chemical" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChemicalKind" NOT NULL DEFAULT 'CHEMICAL',
    "lotNumber" TEXT,
    "potency" DECIMAL(10,4),
    "expiryDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Chemical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "EnquirySource" NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT,
    "queryReference" TEXT,
    "projectReference" TEXT,
    "receiptDetails" TEXT,
    "courierDetails" TEXT,
    "description" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryTest" (
    "enquiryId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,

    CONSTRAINT "EnquiryTest_pkey" PRIMARY KEY ("enquiryId","testId")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "validUntil" DATE,
    "enquiryId" TEXT,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT,
    "placeOfSupplyStateCode" TEXT,
    "gstType" "GstType" NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(12,2) NOT NULL,
    "cgstRate" DECIMAL(5,2) NOT NULL,
    "sgstRate" DECIMAL(5,2) NOT NULL,
    "igstRate" DECIMAL(5,2) NOT NULL,
    "cgst" DECIMAL(12,2) NOT NULL,
    "sgst" DECIMAL(12,2) NOT NULL,
    "igst" DECIMAL(12,2) NOT NULL,
    "roundOff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "terms" TEXT,
    "remarks" TEXT,
    "hodReviewedById" TEXT,
    "hodReviewedAt" TIMESTAMP(3),
    "authorizedById" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "testId" TEXT,
    "sampleDescription" TEXT,
    "testName" TEXT NOT NULL,
    "method" TEXT,
    "specification" TEXT,
    "unit" TEXT,
    "sectionId" TEXT,
    "qty" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poDate" DATE NOT NULL,
    "poValue" DECIMAL(12,2),
    "remarks" TEXT,
    "attachmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleReceipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedById" TEXT NOT NULL,
    "mode" "DispatchMode" NOT NULL DEFAULT 'COURIER',
    "courierName" TEXT,
    "docketNumber" TEXT,
    "numberOfSamples" INTEGER NOT NULL DEFAULT 1,
    "condition" TEXT,
    "remarks" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT,
    "template" "RegistrationTemplate" NOT NULL,
    "sampleName" TEXT NOT NULL,
    "sampleDescription" TEXT,
    "quantity" TEXT,
    "condition" TEXT,
    "templateData" JSONB NOT NULL DEFAULT '{}',
    "remarks" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PRE_REGISTERED',
    "preRegisteredById" TEXT NOT NULL,
    "preRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "customerNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationSection" (
    "registrationId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "SectionWorkStatus" NOT NULL DEFAULT 'PENDING',
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationSection_pkey" PRIMARY KEY ("registrationId","sectionId")
);

-- CreateTable
CREATE TABLE "RegistrationTest" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "testId" TEXT,
    "sourceQuotationItemId" TEXT,
    "testName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT,
    "reportType" "ReportType" NOT NULL DEFAULT 'FINAL_RESULT',
    "replicates" INTEGER NOT NULL DEFAULT 1,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "nablAccredited" BOOLEAN NOT NULL DEFAULT false,
    "formulaId" TEXT,
    "formulaSnapshot" JSONB,
    "status" "TestStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "analystId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "observations" JSONB,
    "rawData" TEXT,
    "readingNotes" TEXT,
    "environment" TEXT,
    "calculatedValue" DECIMAL(20,6),
    "finalResult" TEXT,
    "conformity" "Conformity",
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComments" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalUsage" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "chemicalId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemicalUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentUsage" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "usedFrom" TIMESTAMP(3),
    "usedTo" TIMESTAMP(3),
    "calibrationDueAtUse" DATE,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestReviewEvent" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "comments" TEXT,
    "byId" TEXT NOT NULL,
    "byName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "includeInReport" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "registrationId" TEXT NOT NULL,
    "sectionId" TEXT,
    "format" "ReportFormat" NOT NULL DEFAULT 'STANDARD',
    "includeNabl" BOOLEAN NOT NULL DEFAULT false,
    "includeSpecification" BOOLEAN NOT NULL DEFAULT true,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedToName" TEXT NOT NULL,
    "issuedToAddress" TEXT,
    "issuedToContact" TEXT,
    "remarks" TEXT,
    "validationSummary" TEXT,
    "contentSnapshot" JSONB,
    "pdfAttachmentId" TEXT,
    "previewedById" TEXT,
    "previewedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dispatchDate" DATE NOT NULL,
    "dispatchedById" TEXT NOT NULL,
    "dispatchedByName" TEXT NOT NULL,
    "mode" "DispatchMode" NOT NULL,
    "courierName" TEXT,
    "docketNumber" TEXT,
    "remarks" TEXT,
    "combinedVerifiedById" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DISPATCHED',
    "receivedDate" DATE,
    "receivedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "reportId" TEXT,
    "invoiceId" TEXT,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainedSample" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "receivedInStoreAt" TIMESTAMP(3) NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "storageLocation" TEXT,
    "quantity" TEXT,
    "retentionMonths" INTEGER NOT NULL,
    "plannedDisposalDate" DATE NOT NULL,
    "status" "RetentionStatus" NOT NULL DEFAULT 'RETENTION_ACTIVE',
    "disposedAt" DATE,
    "disposalMethod" TEXT,
    "disposedById" TEXT,
    "disposedByName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetainedSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "draftNumber" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT,
    "quotationId" TEXT,
    "purchaseOrderId" TEXT,
    "customerGstin" TEXT,
    "placeOfSupplyStateCode" TEXT,
    "gstType" "GstType" NOT NULL,
    "taxRelaxation" "TaxRelaxation" NOT NULL DEFAULT 'NONE',
    "relaxationReference" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(12,2) NOT NULL,
    "cgstRate" DECIMAL(5,2) NOT NULL,
    "sgstRate" DECIMAL(5,2) NOT NULL,
    "igstRate" DECIMAL(5,2) NOT NULL,
    "cgst" DECIMAL(12,2) NOT NULL,
    "sgst" DECIMAL(12,2) NOT NULL,
    "igst" DECIMAL(12,2) NOT NULL,
    "roundOff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "poValue" DECIMAL(12,2),
    "advanceReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceReference" TEXT,
    "balanceDue" DECIMAL(12,2) NOT NULL,
    "terms" TEXT,
    "remarks" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "registrationId" TEXT,
    "description" TEXT NOT NULL,
    "sacCode" TEXT,
    "qty" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Signature_entityType_entityId_idx" ON "Signature"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Formula_code_key" ON "Formula"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TestMaster_code_key" ON "TestMaster"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Chemical_code_key" ON "Chemical"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Enquiry_number_key" ON "Enquiry"("number");

-- CreateIndex
CREATE INDEX "Enquiry_status_idx" ON "Enquiry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_quotationId_poNumber_key" ON "PurchaseOrder"("quotationId", "poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SampleReceipt_number_key" ON "SampleReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_number_key" ON "Registration"("number");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE INDEX "RegistrationSection_sectionId_status_idx" ON "RegistrationSection"("sectionId", "status");

-- CreateIndex
CREATE INDEX "RegistrationTest_sectionId_status_idx" ON "RegistrationTest"("sectionId", "status");

-- CreateIndex
CREATE INDEX "RegistrationTest_analystId_status_idx" ON "RegistrationTest"("analystId", "status");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_number_key" ON "Report"("number");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_number_key" ON "Dispatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "RetainedSample_registrationId_key" ON "RetainedSample"("registrationId");

-- CreateIndex
CREATE INDEX "RetainedSample_status_plannedDisposalDate_idx" ON "RetainedSample"("status", "plannedDisposalDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_draftNumber_key" ON "Invoice"("draftNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_idx" ON "EmailOutbox"("status");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMaster" ADD CONSTRAINT "TestMaster_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMaster" ADD CONSTRAINT "TestMaster_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "Formula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryTest" ADD CONSTRAINT "EnquiryTest_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleReceipt" ADD CONSTRAINT "SampleReceipt_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleReceipt" ADD CONSTRAINT "SampleReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "SampleReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSection" ADD CONSTRAINT "RegistrationSection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationTest" ADD CONSTRAINT "RegistrationTest_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationTest" ADD CONSTRAINT "RegistrationTest_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalUsage" ADD CONSTRAINT "ChemicalUsage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "RegistrationTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalUsage" ADD CONSTRAINT "ChemicalUsage_chemicalId_fkey" FOREIGN KEY ("chemicalId") REFERENCES "Chemical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUsage" ADD CONSTRAINT "EquipmentUsage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "RegistrationTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUsage" ADD CONSTRAINT "EquipmentUsage_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestReviewEvent" ADD CONSTRAINT "TestReviewEvent_testId_fkey" FOREIGN KEY ("testId") REFERENCES "RegistrationTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainedSample" ADD CONSTRAINT "RetainedSample_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
