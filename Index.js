const http = require('http');
const url = require('url');
const crypto = require('crypto');

// ==================== CONFIG =====================
const YOUR_API_KEYS = ["7139757137", "1234567890"];
const SITE_FILE = './site.txt';
const CACHE_TIME = 3600 * 1000;
// =================================================

const cache = new Map();

// Helper functions
function generateDeviceId() {
    const sha1_hex = crypto.createHash('sha1').update(crypto.randomBytes(20)).digest('hex');
    const epoch_ms = Date.now();
    const rand8 = Math.random().toString().substr(2, 8).padEnd(8, '0');
    return `1.${sha1_hex}.${epoch_ms}.${rand8}`;
}

function generateUserFingerprint() {
    return crypto.randomBytes(16).toString('hex');
}

function generateRandomContact() {
    return '+918' + Math.random().toString().substr(2, 9).padEnd(9, '0');
}

function generateRandomEmail() {
    return 'user' + Math.floor(100000 + Math.random() * 900000) + '@gmail.com';
}

async function getRandomSite() {
    const fs = require('fs').promises;
    try {
        const data = await fs.readFile(SITE_FILE, 'utf8');
        const sites = data.split('\n').filter(site => site.trim());
        if (sites.length > 0) {
            let randomSite = sites[Math.floor(Math.random() * sites.length)].trim();
            if (!randomSite.match(/^https?:\/\//i)) {
                randomSite = 'https://' + randomSite;
            }
            return randomSite;
        }
    } catch (error) {
        console.log('Site file not found, using default');
    }
    return null;
}

const headers1 = [
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language: en-US,en;q=0.9",
    "Cache-Control: max-age=0",
    "Connection: keep-alive",
    "Sec-Fetch-Dest: document",
    "Sec-Fetch-Mode: navigate",
    "Sec-Fetch-Site: none",
    "Sec-Fetch-User: ?1",
    "Upgrade-Insecure-Requests: 1",
    "User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    'sec-ch-ua: "Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile: ?1",
    'sec-ch-ua-platform: "Android"'
];

async function makeRequest(url, options = {}) {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
        headers: headers1.reduce((acc, header) => {
            const [key, value] = header.split(': ');
            acc[key] = value;
            return acc;
        }, {}),
        ...options
    });
    return await response.text();
}

async function processUPIPayment(domain, upi) {
    const fetch = (await import('node-fetch')).default;
    
    // Step 1: Get initial page
    const html = await makeRequest(domain);
    
    // Extract var data = {...};
    const dataMatch = html.match(/var\s+data\s*=\s*(\{.*?\});/s);
    if (!dataMatch) throw new Error('Data not found in page');
    
    const raw_json = dataMatch[1].replace(/;$/, '');
    const data = JSON.parse(raw_json);
    
    // Extract key_id
    const key_id = data.key_id;
    if (!key_id || !key_id.match(/^rzp_live_[A-Za-z0-9]+$/)) {
        throw new Error('Invalid key_id');
    }
    
    const payment_link_id = data.payment_link?.id;
    let payment_page_id = null;
    let item_id = null;
    
    if (data.payment_link?.payment_page_items?.length > 0) {
        const first_item = data.payment_link.payment_page_items[0];
        payment_page_id = first_item.id;
        item_id = first_item.item?.id;
    }
    
    const keyless_header = data.keyless_header;
    
    // Extract checkout.js URL
    const scriptMatch = html.match(/<script[^>]+src=["']([^"']+checkout\.js[^"']*)["']/i);
    if (!scriptMatch) throw new Error('Checkout script not found');
    const checkout_url = scriptMatch[1];
    
    // Download checkout.js
    const js_text = await makeRequest(checkout_url);
    
    // Extract build tokens
    const buildMatch = js_text.match(/build_v1\s*:\s*"([a-f0-9]+)"/i);
    const build_v1Match = js_text.match(/g\s*=\s*"([a-f0-9]+)"/i);
    
    if (!buildMatch || !build_v1Match) throw new Error('Build tokens not found');
    
    const build = buildMatch[1];
    const build_v1 = build_v1Match[1];
    
    // Generate dynamic values
    const device_id = generateDeviceId();
    const user_fingerprint_v2 = generateUserFingerprint();
    const contact = generateRandomContact();
    const random_email = generateRandomEmail();
    
    // Get session token
    const sessionUrl = `https://api.razorpay.com/v1/checkout/public?traffic_env=production&build=${build}&build_v1=${build_v1}&checkout_v2=1&new_session=1&rzp_device_id=${device_id}&unified_session_id=RVkoCpYCKONydn`;
    const sessionHtml = await makeRequest(sessionUrl);
    
    const sessionMatch = sessionHtml.match(/window\.session_token="([^"]+)"/);
    if (!sessionMatch) throw new Error('Session token not found');
    const session_token = sessionMatch[1];
    
    // Create order
    const orderData = {
        notes: { comment: "" },
        line_items: [{
            payment_page_item_id: payment_page_id,
            amount: "100",
        }]
    };
    
    const orderResponse = await fetch(`https://api.razorpay.com/v1/payment_pages/${payment_link_id}/order`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://razorpay.me',
            'Referer': 'https://razorpay.me/',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
        },
        body: JSON.stringify(orderData)
    });
    
    const orderResult = await orderResponse.json();
    
    const line_item_id = orderResult.line_items?.[0]?.id;
    const order_id = orderResult.order?.id;
    
    if (!line_item_id || !order_id) throw new Error('Order creation failed');
    
    // Validate UPI account
    const validateResponse = await fetch(`https://api.razorpay.com/v1/standard_checkout/payments/validate/account?key_id=${key_id}&session_token=${session_token}&keyless_header=${keyless_header}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://api.razorpay.com',
            'Referer': `https://api.razorpay.com/v1/checkout/public?traffic_env=production&build=${build}&build_v1=${build_v1}&checkout_v2=1&new_session=1&rzp_device_id=${device_id}&unified_session_id=RWXEeGarPyLBLP&session_token=${session_token}`,
            'x-session-token': session_token
        },
        body: `entity=vpa&value=${encodeURIComponent(upi)}`
    });
    
    // Create payment
    const postData = new URLSearchParams({
        'notes[comment]': '',
        'payment_link_id': payment_link_id,
        'key_id': key_id,
        'contact': contact,
        'email': random_email,
        'currency': 'INR',
        '_[checkout_id]': 'RWXKlkIhZewr32',
        '_[device.id]': device_id,
        '_[env]': '',
        '_[library]': 'checkoutjs',
        '_[library_src]': 'no-src',
        '_[current_script_src]': 'no-src',
        '_[is_magic_script]': 'false',
        '_[platform]': 'browser',
        '_[referer]': domain,
        '_[shield][fhash]': '8e3c8116a405dc33d8611a3d650c801da0adc047',
        '_[shield][tz]': '330',
        '_[device_id]': device_id,
        '_[build]': '18588967938',
        '_[request_index]': '0',
        'amount': '100',
        'order_id': order_id,
        'method': 'upi',
        '_[flow]': 'directpay',
        'vpa': upi,
        'upi[flow]': 'collect'
    });
    
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/standard_checkout/payments/create/ajax?key_id=${key_id}&session_token=${session_token}&keyless_header=${keyless_header}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://api.razorpay.com',
            'Referer': `https://api.razorpay.com/v1/checkout/public?traffic_env=production&build=${build}&build_v1=${build_v1}&checkout_v2=1&new_session=1&rzp_device_id=${device_id}&unified_session_id=RWXEeGarPyLBLP&session_token=${session_token}`,
            'x-session-token': session_token
        },
        body: postData.toString()
    });
    
    const finalResult = await paymentResponse.json();
    return finalResult;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    if (req.method !== 'GET') {
        return res.end(JSON.stringify({ error: 'method not allowed' }));
    }
    
    const parsedUrl = url.parse(req.url, true);
    const { upi, key, site } = parsedUrl.query;
    
    if (!upi || !key) {
        return res.end(JSON.stringify({ 
            error: 'missing parameters: upi or key',
            usage: '?upi=username@paytm&key=7139757137&site=optional-site.com'
        }));
    }
    
    if (!YOUR_API_KEYS.includes(key)) {
        return res.end(JSON.stringify({ error: 'invalid key' }));
    }
    
    try {
        let domain = site;
        if (!domain) {
            domain = await getRandomSite();
        }
        if (!domain) {
            throw new Error('No site available');
        }
        
        const result = await processUPIPayment(domain, upi);
        
        if (result.payment_id || result.data?.payment_id) {
            res.end(JSON.stringify({
                status: "success",
                message: "✅ Request Sent Successfully",
                note: "📱 Check Your UPI App Or SMS"
            }));
        } else {
            res.end(JSON.stringify({
                status: "failed",
                message: "❌ Request Sent Failed",
                note: "🙁 Please Try Again Later"
            }));
        }
    } catch (error) {
        res.end(JSON.stringify({
            status: "error",
            message: "❌ Request Failed",
            error: error.message
        }));
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 UPI Payment API running on port ${PORT}`);
    console.log(`📱 Usage: http://localhost:${PORT}/?upi=username@paytm&key=7139757137`);
});
