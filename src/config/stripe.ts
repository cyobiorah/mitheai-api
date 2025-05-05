import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export default stripe;

// // Stripe Pricing Setup (Node.js)
// // Ensure you have installed stripe: npm install stripe

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY!);
// const FRONTEND_URL = process.env.FRONTEND_URL!;

// // 1. Create Products and Prices (run once or via Stripe Dashboard)
// async function createProductsAndPrices() {
//   const tiers = [
//     {
//       name: "Starter",
//       price: 500, // in cents = $5.00
//       features: [
//         "5 social accounts",
//         "Unlimited scheduling",
//         "1 user",
//         "Basic analytics",
//       ],
//     },
//     {
//       name: "Pro",
//       price: 1200,
//       features: [
//         "15 social accounts",
//         "Advanced analytics",
//         "2 teammates",
//         "Asset library",
//       ],
//     },
//     {
//       name: "Team",
//       price: 2000,
//       features: [
//         "Unlimited social accounts",
//         "10 teammates",
//         "Collaboration tools",
//         "Priority support",
//       ],
//     },
//   ];

//   for (const tier of tiers) {
//     const product = await stripe.products.create({
//       name: `Skedlii - ${tier.name}`,
//       description: tier.features.join(", "),
//     });

//     await stripe.prices.create({
//       unit_amount: tier.price,
//       currency: "usd",
//       recurring: { interval: "month" },
//       product: product.id,
//     });
//   }
// }

// // 2. Checkout session example

// // 3. Handle webhook (checkout.session.completed)
// // In your Express server:

// // 4. Billing Portal Session
// async function createBillingPortalSession(customerId: string) {
//   const session = await stripe.billingPortal.sessions.create({
//     customer: customerId,
//     return_url: `${FRONTEND_URL}/dashboard`,
//   });

//   return session.url;
// }

// module.exports = {
//   createProductsAndPrices,
//   createCheckoutSession,
//   createBillingPortalSession,
// };

// // const express = require("express");
// // const router = express.Router();
// // const {
// //   createBillingPortalSession,
// // } = require("../config/stripe");

// // // POST /api/billing-portal
// // router.post("/billing-portal", async (req, res) => {
// //   try {
// //     const { customerId } = req.body;

// //     if (!customerId) {
// //       return res.status(400).json({ error: "Missing customerId" });
// //     }

// //     const url = await createBillingPortalSession(customerId);
// //     res.status(200).json({ url });
// //   } catch (err) {
// //     console.error("Billing portal error:", err);
// //     res.status(500).json({ error: "Internal server error" });
// //   }
// // });

// // module.exports = router;
