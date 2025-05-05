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

// export const createCheckoutSession = async function (
//   userId: string,
//   priceId: string
// ) {
//   const session = await stripe.checkout.sessions.create({
//     mode: "subscription",
//     line_items: [{ price: priceId, quantity: 1 }],
//     success_url: `${FRONTEND_URL}/dashboard?success=true`,
//     cancel_url: `${FRONTEND_URL}/pricing?cancelled=true`,
//     metadata: { userId },
//     customer_email: "user@example.com", // You can pass logged in user's email
//   });

//   return session.url;
// }
