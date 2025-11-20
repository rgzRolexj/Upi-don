const http = require('http');
const url = require('url');

// ==================== CONFIG =====================
const YOUR_API_KEYS = ["7139757137"];
// =================================================

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const parsedUrl = url.parse(req.url, true);
    const { upi, key, type = 'info' } = parsedUrl.query;

    if (!upi || !key) {
        return res.end(JSON.stringify({ error: 'missing parameters: upi or key' }));
    }

    if (!YOUR_API_KEYS.includes(key)) {
        return res.end(JSON.stringify({ error: 'invalid key' }));
    }

    try {
        if (type === 'payment') {
            // UPI Payment logic yahan
            res.end(JSON.stringify({
                status: "success", 
                message: "✅ Payment Request Sent",
                note: "📱 Check Your UPI App"
            }));
        } else {
            // UPI Info logic yahan  
            res.end(JSON.stringify({
                status: "success",
                vpa: upi,
                name: "Test User",
                credit_by: "splexx"
            }));
        }
    } catch (error) {
        res.end(JSON.stringify({ error: error.message }));
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 UPI API running on port ${PORT}`);
});
