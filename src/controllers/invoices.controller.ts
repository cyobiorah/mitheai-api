import { Request, Response } from "express";
import {
  getInvoicesByIndividual,
  getInvoicesByOrganization,
} from "../services/invoices.service";

export const getIndividualInvoicesController = async (
  req: Request,
  res: Response
) => {
  const userId = req.params.userId;

  try {
    const invoices = await getInvoicesByIndividual(userId);
    res.status(200).json(invoices);
  } catch (error) {
    console.error("Failed to fetch individual invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
};

export const getOrganizationInvoicesController = async (
  req: Request,
  res: Response
) => {
  const organizationId = req.params.organizationId;

  try {
    const invoices = await getInvoicesByOrganization(organizationId);
    res.status(200).json({ invoices });
  } catch (error) {
    console.error("Failed to fetch organization invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
};
