/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
	hosted_domain,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
	hosted_domain?: string;
}) {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	if (hosted_domain) upstream.searchParams.set("hd", hosted_domain);
	upstream.searchParams.set("response_type", "code");
	return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 *
 * @param {Object} options
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.client_secret - The client secret of the application.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.upstream_url - The token endpoint URL of the upstream service.
 * @param {string} [options.grant_type] - The grant type for the token request.
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response.
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
	grant_type,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
	grant_type?: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const requestBodyParams: Record<string, string> = {
		client_id,
		client_secret,
		code,
		redirect_uri,
	};

	if (grant_type) {
		requestBodyParams.grant_type = grant_type;
	}

	const resp = await fetch(upstream_url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Accept": "application/json",
		},
		body: new URLSearchParams(requestBodyParams).toString(),
	});
	if (!resp.ok) {
		console.log(await resp.text());
		return [null, new Response("Failed to fetch access token from upstream", { status: resp.status })];
	}

	const body = await resp.json() as { access_token?: string, error?: string, error_description?: string };

	const accessToken = body.access_token;

	if (!accessToken) {
		console.error("Missing access_token in upstream response:", body);
		const errorDescription = body.error_description || body.error || "Missing access_token";
		return [null, new Response(`Failed to obtain access token: ${errorDescription}`, { status: 400 })];
	}
	if (typeof accessToken !== 'string') {
		console.error("access_token is not a string:", accessToken);
		return [null, new Response("Obtained access_token is not a string", { status: 500 })];
	}
	return [accessToken, null];
}
// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	login: string
	name: string
	email: string
	userEmail: string
	accessToken: string
}

