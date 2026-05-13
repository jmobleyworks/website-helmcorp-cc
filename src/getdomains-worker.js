/**
 * getdomains.johnmobley99.workers.dev
 * Returns JSON list of all domains registered with Cloudflare account
 * Uses Cloudflare API v4 to query zone list
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route: /getdomains or /
    if (url.pathname === '/getdomains' || url.pathname === '/') {
      return await handleGetDomains(env);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

async function handleGetDomains(env) {
  try {
    // Get Cloudflare API credentials from environment
    const cfToken = env.CLOUDFLARE_API_TOKEN;
    const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID;

    if (!cfToken) {
      return errorResponse('Cloudflare API token not configured', 500);
    }

    // Query Cloudflare API v4 for all zones (domains)
    // https://developers.cloudflare.com/api/operations/zones-get
    const cfApiUrl = 'https://api.cloudflare.com/client/v4/zones?per_page=100';

    const response = await fetch(cfApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return errorResponse(`Cloudflare API error: ${response.status}`, 500);
    }

    const data = await response.json();

    if (!data.success) {
      return errorResponse('Cloudflare API returned error', 500);
    }

    // Extract domain names from zones
    const domains = data.result.map((zone) => ({
      name: zone.name,
      status: zone.status,
      nameservers: zone.nameservers,
      created_on: zone.created_on,
      plan: zone.plan?.name || 'unknown',
    }));

    // Sort alphabetically
    domains.sort((a, b) => a.name.localeCompare(b.name));

    return successResponse({
      total: domains.length,
      domains: domains,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return errorResponse(`Error: ${error.message}`, 500);
  }
}

function successResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
