import { z } from "zod";
import { experimental_PaidMcpAgent as PaidMcpAgent } from "@stripe/agent-toolkit/cloudflare";
import { REUSABLE_PAYMENT_REASON } from "../helpers/constants";

type AgentProps = {
	userEmail: string;
};

export function subscriptionTool(
	agent: PaidMcpAgent<Env, any, AgentProps>,
	env?: { STRIPE_SUBSCRIPTION_PRICE_ID: string; BASE_URL: string }
) {

	const priceId = env?.STRIPE_SUBSCRIPTION_PRICE_ID || null;
	const baseUrl = env?.BASE_URL || null;

	if (!priceId || !baseUrl) {
		throw new Error("No env provided");
	}
	
	agent.paidTool(
		"subscription_add",
		"Adds two numbers together for paid subscribers.",
		{ a: z.number(), b: z.number() },
		async ({ a, b }: { a: number; b: number }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}),
		{
			checkout: {
				success_url: `${baseUrl}/payment/success`,
				line_items: [
				{
					price: priceId,
					quantity: 1,
				},
				],
				mode: 'subscription',
			},
			paymentReason: REUSABLE_PAYMENT_REASON,
		}
	);
}