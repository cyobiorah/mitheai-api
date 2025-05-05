import Stripe from "stripe";
import { Request, Response } from "express";
import * as usersService from "../services/users.service";
import { saveIndividualInvoice } from "../services/invoices.service";
import {
  sendPaymentFailedEmail,
  sendPaymentSuccessEmail,
} from "../services/email.service";
import { logToSlack } from "../utils/slack";

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
    return res
      .status(400)
      .json({ error: `Webhook Error: ${String(err.message)}` });
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
        lastActionType: session.metadata.action,
      });
    }

    // 2. Invoice Payment Succeeded
    else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      const lineItem = invoice.lines.data[0];
      const price = invoice.total;

      const updatedUser = {
        stripeCustomerId: invoice.customer,
        invoiceId: invoice.id,
        subscriptionStatus: invoice.status,
        renewalDate: new Date(lineItem.period.end * 1000).toISOString(),
        billingAmount: price / 100,
        currency: invoice.currency,
        paymentDescription: lineItem.description,
        invoicePdf: invoice.invoice_pdf,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        productId: lineItem.pricing?.price_details?.product,
      };

      // update user via stripeCustomerId
      const user = await usersService.updateUserByStripeId(
        updatedUser.stripeCustomerId as string,
        updatedUser
      );

      // save invoice for the user
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
        subscriptionId:
          lineItem.parent?.subscription_item_details?.subscription ?? "n/a",
      });

      await logToSlack(
        `✅ Payment Succeeded for ${user.email}\nPlan: ${
          lineItem.pricing?.price_details?.product
        }\nAmount: $${
          invoice.amount_paid / 100
        } ${invoice.currency.toUpperCase()}`
      );

      try {
        // send payment success email
        await sendPaymentSuccessEmail({
          to: user.email,
          firstName: user.firstName,
          planName: lineItem.pricing?.price_details?.product!,
          renewalDate: new Date(lineItem.period.end * 1000).toISOString(),
          amountPaid: invoice.amount_paid / 100,
          currency: invoice.currency,
        });
      } catch (error) {
        console.error("Error sending payment success email:", error);
      }
    }

    // 2b. Invoice Payment Failed
    else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;

      console.warn("Invoice payment failed:", invoice.id);

      const user = await usersService.updateUserByStripeId(
        invoice.customer as string,
        {
          subscriptionStatus: "payment_failed",
          lastInvoiceId: invoice.id,
        }
      );

      const lineItem = invoice.lines.data[0];

      await saveIndividualInvoice({
        userId: invoice.customer as string,
        stripeInvoiceId: invoice.id!,
        amountPaid: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status!,
        billingReason: invoice.billing_reason!,
        hostedInvoiceUrl: invoice.hosted_invoice_url!,
        invoicePdf: invoice.invoice_pdf!,
        createdAt: new Date(invoice.created * 1000),
        subscriptionId:
          lineItem?.parent?.subscription_item_details?.subscription ?? "n/a",
      });

      await logToSlack(
        `❌ Payment Failed for ${user.email}\nInvoice: ${
          invoice.id
        }\nAmount Due: $${
          invoice.amount_due / 100
        } ${invoice.currency.toUpperCase()}`
      );

      try {
        // send payment failed email
        await sendPaymentFailedEmail({
          to: user.email,
          firstName: user.firstName,
          planName: lineItem.pricing?.price_details?.product!,
          amountDue: invoice.amount_due / 100,
          currency: invoice.currency,
          invoiceDate: new Date(invoice.created * 1000).toISOString(),
          billingLink: invoice.hosted_invoice_url!,
        });
      } catch (error) {
        console.error("Error sending payment failed email:", error);
      }
    }

    // 3. Customer Subscription Deleted (optional handling)
    else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      await usersService.updateUserByStripeId(subscription.customer as string, {
        subscriptionStatus: "cancelled",
      });

      await logToSlack(
        `⚠️ Subscription cancelled for customer: ${
          subscription.customer as string
        }`
      );
    }

    // 4. Other event types can be handled similarly...
    else {
      console.log("Unhandled event type:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
