import { Request, Response } from "express";
import { createCheckoutSession } from "../services/checkout.service";

export async function createCheckout(req: Request, res: Response) {
  try {
    const { userId, email, planId, stripeCustomerId } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
    }

    const url = await createCheckoutSession(userId, email, planId, stripeCustomerId);
    res.status(200).json({ url });
  } catch (err) {
    console.error("Stripe Checkout Error:", err);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
}
