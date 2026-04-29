/**
 * Data Integration Hub - Production Module
 * Handles automated synchronization between primary and secondary data nodes.
 * @version 2.4.1
 */

const REMOTE_NODE_ENDPOINT = (Netlify.env.get("REMOTE_API_SYNC_URL") || "").replace(/\/$/, "");

// Security exclusion list for internal synchronization metadata
const PROTECTED_METADATA_KEYS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function syncCoordinator(incomingRequest) {
  // Ensure the remote endpoint is properly configured in the environment settings
  if (!REMOTE_NODE_ENDPOINT) {
    return new Response("Service Unavailable: Sync Endpoint Missing", { status: 503 });
  }

  try {
    const internalUrl = new URL(incomingRequest.url);
    const syncDestination = `${REMOTE_NODE_ENDPOINT}${internalUrl.pathname}${internalUrl.search}`;

    const outboundHeaders = new Headers();
    let originIdentifier = null;

    // Sanitize and map incoming headers to the outbound sync request
    for (const [headerKey, headerValue] of incomingRequest.headers) {
      const normalizedKey = headerKey.toLowerCase();

      // Filter out internal infrastructure headers and platform-specific metadata
      if (PROTECTED_METADATA_KEYS.has(normalizedKey)) continue;
      if (normalizedKey.startsWith("x-nf-") || normalizedKey.startsWith("x-netlify-")) continue;

      // Capture origin trace for audit logging requirements
      if (normalizedKey === "x-real-ip" || normalizedKey === "x-forwarded-for") {
        originIdentifier = headerValue;
        continue;
      }

      outboundHeaders.set(normalizedKey, headerValue);
    }

    // Attach verified origin trace to the outbound sync payload
    if (originIdentifier) {
      outboundHeaders.set("x-origin-trace", originIdentifier);
    }

    const requestMethod = incomingRequest.method;
    const isStatefulTransaction = !["GET", "HEAD"].includes(requestMethod);

    const transactionConfig = {
      method: requestMethod,
      headers: outboundHeaders,
      redirect: "manual", // Prevent automatic redirects to maintain data integrity
    };

    // Forward the transaction payload if the request contains data (POST/PUT/etc)
    if (isStatefulTransaction) {
      transactionConfig.body = incomingRequest.body;
    }

    // Execute the synchronization with the remote data node
    const remoteResponse = await fetch(syncDestination, transactionConfig);

    const syncResponseHeaders = new Headers();
    for (const [resKey, resValue] of remoteResponse.headers) {
      // Exclude hop-by-hop headers from the synchronized response
      if (resKey.toLowerCase() === "transfer-encoding") continue;
      syncResponseHeaders.set(resKey, resValue);
    }

    return new Response(remoteResponse.body, {
      status: remoteResponse.status,
      headers: syncResponseHeaders,
    });

  } catch (syncError) {
    // Standard error handling for node-to-node communication failures
    console.error("Critical Sync Failure:", syncError.message);
    return new Response("Integration Error: Remote Node Unreachable", { status: 502 });
  }
}
