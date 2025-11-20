const http = require('http');
const url = require('url');

const YOUR_API_KEYS = ["7139757137"];

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const parsedUrl = url.parse(req.url, true);
    const { upi, key, type = 'info' } = parsedUrl.query;

    if (!upi || !key) {
        return res.end(JSON.stringify({ 
            error: 'Missing parameters',
            usage: '?upi=test@paytm&key=7139757137&type=info|payment'
        }));
    }

    if (!YOUR_API_KEYS.includes(key)) {
        return res.end(JSON.stringify({ error: 'Invalid API key' }));
    }

    try {
        if (type === 'payment') {
            res.end(JSON.stringify({
                status: "success", 
                message: "✅ UPI Payment Request Sent",
                note: "📱 Check Your UPI App",
                upi: upi,
                credit_by: "splexx"
            }));
        } else {
            res.end(JSON.stringify({
                status: "success",
                vpa: upi,
                name: "Demo Account",
                ifsc: "SBIN0000000",
                bank: "State Bank of India", 
                credit_by: "splexx",
                developer: "splexxo"
            }));
        }
    } catch (error) {
        res.end(JSON.stringify({ error: 'Request failed' }));
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
