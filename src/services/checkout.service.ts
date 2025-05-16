import stripe from "../config/stripe";

export async function createCheckoutSession(
  userId: string,
  email: string,
  planId: string,
  customerId?: string
) {
  const isReturningCustomer = !!customerId;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: planId, quantity: 1 }],
    customer: customerId ?? undefined,
    customer_email: isReturningCustomer ? undefined : email,
    // customer_creation: isReturningCustomer ? undefined : "always",
    metadata: {
      userId,
      isReturningCustomer: isReturningCustomer.toString(),
      action: isReturningCustomer ? "upgrade_or_downgrade" : "new_subscription",
    },
    success_url: `${process.env.FRONTEND_URL}/dashboard/billing?subscribed=true`,
    cancel_url: `${process.env.FRONTEND_URL}/dashboard/billing?canceled=true`,
  });

  return session.url;
}
