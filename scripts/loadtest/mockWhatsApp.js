// Stand-in for the real AiSensy/apikaro WhatsApp API during load testing —
// never hits the real provider, never sends a real message to a real phone
// number. Responds with a realistic simulated delay so the load test still
// measures the cost of the synchronous external call in addAppointmentV2/
// deleteAppointment, without the risk of a genuine third-party network call.
const http = require('http');

const PORT = process.env.MOCK_WHATSAPP_PORT || 3999;
const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 500;

const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
        const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
        setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, mock: true }));
        }, delay);
    });
});

server.listen(PORT, () => {
    console.log(`Mock WhatsApp stub listening on http://localhost:${PORT}`);
});
