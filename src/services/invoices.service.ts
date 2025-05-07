import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// INDIVIDUAL INVOICES
export const saveIndividualInvoice = async (invoiceData: {
  userId: string;
  stripeInvoiceId: string;
  amountPaid: number;
  currency: string;
  status: string;
  billingReason?: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  createdAt: Date;
  subscriptionId?: string;
  subscriptionTier?: string;
  interval?: string;
}) => {
  const { invoices } = await getCollections();

  return await invoices.insertOne({
    ...invoiceData,
    userId: new ObjectId(invoiceData.userId),
    isOrganization: false,
  });
};

export const getInvoicesByIndividual = async (userId: string) => {
  const { invoices } = await getCollections();
  return await invoices
    .find({ userId: new ObjectId(userId), isOrganization: false })
    .sort({ createdAt: -1 })
    .toArray();
};

// ORGANIZATION INVOICES
export const saveOrganizationInvoice = async (invoiceData: {
  organizationId: string;
  stripeInvoiceId: string;
  amountPaid: number;
  currency: string;
  status: string;
  billingReason?: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  createdAt: Date;
  subscriptionId?: string;
  subscriptionTier?: string;
  interval?: string;
}) => {
  const { invoices } = await getCollections();

  return await invoices.insertOne({
    ...invoiceData,
    organizationId: new ObjectId(invoiceData.organizationId),
    isOrganization: true,
  });
};

export const getInvoicesByOrganization = async (organizationId: string) => {
  const { invoices } = await getCollections();
  return await invoices
    .find({
      organizationId: new ObjectId(organizationId),
      isOrganization: true,
    })
    .sort({ createdAt: -1 })
    .toArray();
};
