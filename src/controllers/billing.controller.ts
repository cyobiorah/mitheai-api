import { Request, Response } from "express";
import { createBillingPortalSession } from "../services/billing.service";

export async function handleBillingPortal(req: Request, res: Response) {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }

    const url = await createBillingPortalSession(customerId);
    return res.status(200).json({ url });
  } catch (err) {
    console.error("Billing portal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}