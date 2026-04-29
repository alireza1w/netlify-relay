const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // دریافت آدرس هدف از متغیر محیطی یا پارامتر ورودی
    const targetUrl = process.env.TARGET_URL || event.queryStringParameters.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Target URL is required for analysis." })
        };
    }

    try {
        const response = await fetch(targetUrl, {
            method: event.httpMethod,
            headers: {
                ...event.headers,
                "host": new URL(targetUrl).host
            },
            body: event.body,
            redirect: 'follow'
        });

        const data = await response.buffer();

        return {
            statusCode: response.status,
            headers: {
                "access-control-allow-origin": "*",
                "content-type": response.headers.get("content-type") || "application/octet-stream"
            },
            body: data.toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Relay failed", details: error.message })
        };
    }
};
