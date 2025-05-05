import Stripe from "stripe";
import { Request, Response } from "express";
import * as usersService from "../services/users.service";
import { saveIndividualInvoice } from "../services/invoices.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export async function handleWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    console.error("No Stripe signature header found");
    return res.status(400).send("Missing Stripe signature");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig as string,
      webhookSecret!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 1. Checkout Session Completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (!session.metadata?.userId || !session.customer) {
        console.warn("Missing userId or customer in session metadata");
        return res.status(400).send("Missing metadata");
      }

      await usersService.updateUserProfile(session.metadata.userId, {
        userId: session.metadata.userId,
        stripeCustomerId: session.customer,
        subscriptionId: session.subscription,
      });

      console.log(
        `✅ checkout.session.completed: User ${session.metadata.userId} updated`
      );
    }

    // 2. Invoice Payment Succeeded
    else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      const lineItem = invoice.lines?.data?.[0];
      if (!lineItem) {
        console.warn("Invoice received with no line items");
        return res.status(400).send("Missing line items");
      }

      const price = lineItem.price as Stripe.Price;

      const updatedUser = {
        stripeCustomerId: invoice.customer,
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        subscriptionStatus: invoice.status,
        renewalDate: new Date(lineItem.period.end * 1000).toISOString(),
        billingAmount: invoice.amount_paid / 100,
        currency: invoice.currency,
        paymentDescription: lineItem.description,
        invoicePdf: invoice.invoice_pdf,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        productId: price?.product as string,
        interval: price?.recurring?.interval ?? "monthly",
        subscriptionTier: price.nickname ?? price.id,
      };

      const user = await usersService.updateUserByStripeId(
        updatedUser.stripeCustomerId as string,
        updatedUser
      );

      await saveIndividualInvoice({
        userId: user._id.toString(),
        stripeInvoiceId: invoice.id!,
        amountPaid: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status!,
        billingReason: invoice.billing_reason!,
        hostedInvoiceUrl: invoice.hosted_invoice_url!,
        invoicePdf: invoice.invoice_pdf!,
        createdAt: new Date(invoice.created * 1000),
        subscriptionId: invoice.subscription!,
        interval: price?.recurring?.interval ?? "monthly",
      });

      console.log(`✅ invoice.payment_succeeded: Invoice and user updated`);
    }

    // 3. Customer Subscription Deleted
    else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      await usersService.updateUserByStripeId(subscription.customer as string, {
        subscriptionStatus: "cancelled",
      });

      console.log(
        `✅ customer.subscription.deleted: Subscription cancelled for ${subscription.customer}`
      );
    } else {
      console.log("Unhandled event type:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
