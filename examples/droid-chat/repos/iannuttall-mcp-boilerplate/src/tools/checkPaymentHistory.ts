import { z } from "zod";
import { experimental_PaidMcpAgent as PaidMcpAgent } from "@stripe/agent-toolkit/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Stripe from "stripe";

export function checkPaymentHistoryTool(
	agent: PaidMcpAgent<Env, any, any>,
	env: { BASE_URL: string; STRIPE_SECRET_KEY: string }
) {
	const baseUrl = env.BASE_URL;
	const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
		apiVersion: "2025-02-24.acacia",
	});

	(agent.server as McpServer).tool(
		"check_payment_history",
		"This tool checks for active subscriptions and one-time purchases for the logged in user's Stripe customer ID.",
		{},
		async () => {
			let responseData: {
				userEmail?: string | null;
				stripeCustomerId?: string | null;
				subscriptions?: Array<{
					id: string;
					status: string;
					items: Array<{ productName: string; productId: string; }>;
					current_period_end?: number;
					cancel_at_period_end?: boolean;
					cancel_at?: number | null;
					ended_at?: number | null;
				}>;
				oneTimePayments?: Array<{
					id: string;
					amount: number;
					currency: string;
					status: string;
					description: string | null;
					created: number;
					receipt_url: string | null;
					productName?: string;
				}>;
				billingPortal?: { url: string | null; message: string; };
				statusMessage?: string;
				error?: string;
				isError?: boolean;
				agentInstructions?: string;
			} = {};

			try {
				let userEmail = agent.props?.userEmail;
				let customerId: string | null = null;

				// Attempt 1: Try to get customerId from agent.state
				if (agent.state?.stripe?.customerId) {
					customerId = agent.state.stripe.customerId;
					// If we got customerId from state, try to ensure userEmail is also available if not already set from props.
					if (!userEmail && customerId) {
						try {
							const customer = await stripe.customers.retrieve(customerId);
							if (customer && !customer.deleted && 'email' in customer && customer.email) {
								userEmail = customer.email; // Populate userEmail based on customerId from state
							}
						} catch (e) {
							// Non-fatal: if customer retrieve fails, we still have customerId. Email might remain null.
							// console.warn("Could not retrieve customer details to confirm email from state-based customerId:", e);
						}
					}
				}

				// Attempt 2: If customerId not found in state, try to find by userEmail (if email is available)
				if (!customerId && userEmail) {
					try {
						const customers = await stripe.customers.list({
							email: userEmail,
							limit: 1,
						});
						if (customers.data.length > 0) {
							customerId = customers.data[0].id;
							// console.log(`Found customer ID ${customerId} for email ${userEmail}`);
						} else {
							// console.log(`No Stripe customer found for email ${userEmail}.`);
							// For a "check status" tool, we don't create a customer if one isn't found.
						}
					} catch (e: any) {
						// console.error(`Error searching for customer by email ${userEmail}:`, e.message);
						responseData.error = `Error finding Stripe customer for email ${userEmail}: ${e.message}`;
						responseData.isError = true;
						return {
							content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
						};
					}
				}
				
				responseData.userEmail = userEmail || null;

				if (!customerId) {
					let message = "Could not identify your Stripe customer ID. ";
					if (userEmail) {
						message += `No customer record was found for your email: ${userEmail}. Have you previously completed a checkout or used a paid feature?`;
						responseData.agentInstructions = `AI_AGENT_ACTION: Inform the user that no Stripe customer account was found for their email ${userEmail}. Advise them to check the email provided or complete a transaction if they expect to have an account.`;
					} else {
						message += "Your email is not available to the agent, and no existing customer ID was found in your session state.";
						responseData.agentInstructions = "AI_AGENT_ACTION: Inform the user that their email is not available and no customer ID is in their session state, so subscription status cannot be checked. Ask them to ensure their email is correctly configured/provided or to log in again.";
					}
					responseData.statusMessage = message;
					responseData.isError = true;
					return {
						content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
					};
				}
				responseData.stripeCustomerId = customerId;

				const subscriptionsData = await stripe.subscriptions.list({
					customer: customerId,
					status: 'active',
					limit: 10,
				});

				responseData.subscriptions = [];
				if (subscriptionsData.data.length > 0) {
					responseData.statusMessage = `Found ${subscriptionsData.data.length} active subscription(s).`;
					for (const sub of subscriptionsData.data) {
						const subscriptionOutput: {
							id: string;
							status: string;
							items: Array<{ productName: string; productId: string; }>;
							current_period_end?: number;
							cancel_at_period_end?: boolean;
							cancel_at?: number | null;
							ended_at?: number | null;
						} = {
							id: sub.id,
							status: sub.status,
							items: [],
							current_period_end: sub.current_period_end,
							cancel_at_period_end: sub.cancel_at_period_end,
							cancel_at: sub.cancel_at,
							ended_at: sub.ended_at,
						};
						for (const item of sub.items.data) {
							let productName = 'Unknown Product';
							let productId = 'N/A';
							if (typeof item.price.product === 'string') {
								productId = item.price.product;
								try {
									const product = await stripe.products.retrieve(item.price.product);
									// console.log("Retrieved product details:", JSON.stringify(product, null, 2));
									if (product && product.name) {
										productName = product.name;
									}
								} catch (e: any) {
									// console.error(`Error retrieving product details for ID ${item.price.product}:`, e);
									productName = `Could not retrieve product name (ID: ${item.price.product}, Error: ${e.message})`;
								}
							}
							subscriptionOutput.items.push({ productName, productId });
						}
						responseData.subscriptions.push(subscriptionOutput);
					}
				} else {
					responseData.statusMessage = "No active subscriptions found.";
				}

				// Fetch one-time payments (charges)
				try {
					const charges = await stripe.charges.list({
						customer: customerId,
						limit: 20, // Adjust limit as needed
					});
					responseData.oneTimePayments = [];
					if (charges.data.length > 0) {
						for (const charge of charges.data) {
							// We're interested in successful, non-refunded, standalone charges.
							// Subscriptions also create charges, so we try to filter those out
							// by checking if `invoice` is null. This isn't a perfect filter
							// as some direct charges might have invoices, but it's a common case.
							// Also, payment intents are the newer way, but charges cover older transactions.
							if (charge.paid && !charge.refunded && !charge.invoice) {
								let productName: string | undefined = undefined;
								// Attempt to get product name if a product ID is associated (might not always be the case for charges)
								// This part is speculative as charges don't directly link to products like subscription items do.
								// Often, the description or metadata on the charge or its payment_intent might hold product info.
								// For simplicity, we'll rely on description for now.
								// If `transfer_data` and `destination` exist, it might be a connect payment, not a direct sale.
								
								// If you have a way to link charges to specific products (e.g., via metadata), implement here.
								// For example, if you store product_id in charge metadata:
								// if (charge.metadata && charge.metadata.product_id) {
								//   try {
								//     const product = await stripe.products.retrieve(charge.metadata.product_id);
								//     productName = product.name;
								//   } catch (e) {
								//     console.warn("Could not retrieve product for charge:", e);
								//   }
								// }

								responseData.oneTimePayments.push({
									id: charge.id,
									amount: charge.amount,
									currency: charge.currency,
									status: charge.status,
									description: charge.description || 'N/A',
									created: charge.created,
									receipt_url: charge.receipt_url,
									productName: productName, // Will be undefined if not found
								});
							}
						}
						if (responseData.oneTimePayments.length > 0) {
							const existingMsg = responseData.statusMessage ? responseData.statusMessage + " " : "";
							responseData.statusMessage = existingMsg + `Found ${responseData.oneTimePayments.length} relevant one-time payment(s).`;
						} else {
							const existingMsg = responseData.statusMessage ? responseData.statusMessage + " " : "";
							responseData.statusMessage = existingMsg + "No relevant one-time payments found.";
						}
					} else {
						const existingMsg = responseData.statusMessage ? responseData.statusMessage + " " : "";
						responseData.statusMessage = existingMsg + "No one-time payment history found.";
					}
				} catch (e: any) {
					// console.error("Error fetching one-time payments:", e.message);
					const existingMsg = responseData.statusMessage ? responseData.statusMessage + " " : "";
					responseData.statusMessage = existingMsg + "Could not retrieve one-time payment history due to an error.";
					// Optionally, add to responseData.error if this should be a hard error
				}

				responseData.billingPortal = { url: null, message: "" };
				if (baseUrl) {
					try {
						const portalSession = await stripe.billingPortal.sessions.create({
							customer: customerId,
							return_url: `${baseUrl}/`,
						});
						if (portalSession.url) {
							responseData.billingPortal.url = portalSession.url;
							responseData.billingPortal.message = "Manage your billing and subscriptions here.";
						} else {
							responseData.billingPortal.message = "Could not retrieve billing portal URL, but session creation was reported as successful.";
						}
					} catch (portalError: any) {
						// console.error("Error creating Stripe billing portal session:", portalError.message);
						if (portalError.message && portalError.message.includes("No configuration provided")) {
							responseData.billingPortal.message = `Could not generate a link to the customer billing portal: ${portalError.message}`;
						} else {
							responseData.billingPortal.message = "Could not generate a link to the customer billing portal at this time due to an unexpected error.";
						}
					}
				} else {
					responseData.billingPortal.message = "Billing portal link could not be generated: BASE_URL is not configured.";
				}

				// Construct agent instructions
				let anySubscriptionEndingOrCancelled = false;
				if (responseData.subscriptions && responseData.subscriptions.length > 0) {
					for (const sub of responseData.subscriptions) {
						// A subscription is considered "ending or cancelled" if:
						// 1. It's explicitly set to cancel at period end.
						// 2. Or, its status is not 'active' AND it has an ended_at date (this covers already past-due/cancelled subs
						//    if they were somehow fetched, though less likely with 'status: active' filter).
						if (sub.cancel_at_period_end || (sub.status !== 'active' && sub.ended_at)) {
							anySubscriptionEndingOrCancelled = true;
							break;
						}
					}
				}

				let agentInstructionText = "AI_AGENT_ACTION: Present the user\'s subscription details (userEmail, subscriptions) in Markdown format. Do NOT display the stripeCustomerId or the productId for subscription items. " +
					"For each subscription, clearly state its status and product name. " +
					"If the subscription has an end date (from 'ended_at'), mention it. " +
					"If it\'s set to cancel (from 'cancel_at_period_end' is true and 'cancel_at' is set), state the cancellation date. " +
					"Otherwise, if it\'s active, state its renewal date (from 'current_period_end'). " +
					"All relevant dates are provided as Unix timestamps in the subscription data; please convert them to a human-readable format (e.g., YYYY-MM-DD or Month Day, Year) when presenting to the user. ";

				if (responseData.oneTimePayments && responseData.oneTimePayments.length > 0) {
					agentInstructionText += "Also, list any one-time payments, including the product name (if available) or description, amount (formatted with currency), status, and date of purchase (human-readable). Provide the receipt URL if available. ";
				}

				if (responseData.billingPortal?.url) {
					if (anySubscriptionEndingOrCancelled) {
						agentInstructionText += `Some subscriptions are ending or have been cancelled. You can manage or potentially renew them at the billing portal. Ask the user: 'Would you like to open the billing portal to manage your subscriptions?' `;
					} else {
						agentInstructionText += `A billing portal is available. Ask the user: 'Would you like to open the billing portal?' `;
					}
					agentInstructionText += `If they respond affirmatively, run the appropriate command for their OS to open the URL ${responseData.billingPortal.url} in their default browser.`;
				} else if (responseData.billingPortal?.message) {
					agentInstructionText += `Inform the user about the billing portal status: '${responseData.billingPortal.message}'.`;
				} else {
					agentInstructionText += "Inform the user that no billing portal information is available.";
				}
				responseData.agentInstructions = agentInstructionText;

				return {
					content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
				};

			} catch (error: any) {
				// console.error("Error in checkPaymentStatusTool:", error.message);
				responseData = { // Overwrite responseData for a clean error output
					error: `An error occurred while checking payment status: ${error.message}`,
					isError: true,
					// Optional: Add a generic agent instruction for errors
					// agentInstructions: "AI_AGENT_ACTION: Inform the user that an error occurred while checking their payment status."
				};
				return {
					content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
				};
			}
		}
	);
}