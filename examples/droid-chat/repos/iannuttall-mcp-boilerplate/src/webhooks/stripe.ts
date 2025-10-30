import { Stripe } from "stripe";

// Using the Env type from worker-configuration.d.ts
type Env = Cloudflare.Env;

/**
 * Simple webhook handler for Stripe events
 * 
 * This is a minimal example that logs events related to:
 * - Checkout sessions (payments)
 * - Subscription status changes
 */
export default {
  fetch: async (request: Request, env: Env) => {
    // Only handle POST requests to /webhooks/stripe
    if (request.method !== "POST" || new URL(request.url).pathname !== "/webhooks/stripe") {
      return new Response("Not found", { status: 404 });
    }

    // Ensure we have the required environment variables
    if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) {
      console.error("Missing required Stripe environment variables");
      return new Response("Server configuration error", { status: 500 });
    }

    try {
      // Get the request body as text
      const body = await request.text();
      
      // Get the signature from the headers
      const signature = request.headers.get("stripe-signature");
      if (!signature) {
        return new Response("No Stripe signature found", { status: 400 });
      }

      // Initialize Stripe
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);

      // Verify and construct the event
      const event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );

      // Log the event type
      console.log(`Received Stripe webhook event: ${event.type}`);

      // Handle events based on their type
      switch (event.type) {
        // Payment events
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log(`Payment completed for session: ${session.id}`);
          console.log(`Customer: ${session.customer}`);
          console.log(`Payment status: ${session.payment_status}`);
          
          // In a production app, you would update your database here
          // For example, marking the user as having paid for a specific tool
          break;
        }
        
        // Subscription events
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`Subscription event: ${event.type}`);
          console.log(`Subscription ID: ${subscription.id}`);
          console.log(`Customer: ${subscription.customer}`);
          console.log(`Status: ${subscription.status}`);
          
          // In a production app, you would update subscription status in your database
          break;
        }
        
        // Invoice events
        case "invoice.payment_succeeded":
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`Invoice event: ${event.type}`);
          console.log(`Invoice ID: ${invoice.id}`);
          console.log(`Customer: ${invoice.customer}`);
          console.log(`Amount paid: ${invoice.amount_paid}`);
          
          // Handle successful or failed payments
          break;
        }
        
        // Default case for unhandled events
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Return a 200 success response to acknowledge receipt
      return new Response("Webhook received", { status: 200 });
      
    } catch (error: any) {
      // Log the error for debugging
      console.error("Webhook error:", error);
      
      // Specific message for signature verification errors
      if (error.type === 'StripeSignatureVerificationError') {
        return new Response(
          "Webhook signature verification failed. Check that your STRIPE_WEBHOOK_SECRET matches the signing secret in your Stripe dashboard.", 
          { status: 400 }
        );
      }
      
      return new Response(`Webhook error: ${error.message}`, { status: 400 });
    }
  },
};
