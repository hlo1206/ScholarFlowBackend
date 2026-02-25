const axios = require('axios');
const cors = require('cors');

// CORS setup
const corsHandler = cors({ origin: true });

// Helper to get keys from .env dynamically
const getApiKeys = () => {
    const keys = [];
    for (let i = 1; i <= 7; i++) {
        const key = process.env[`GEMINI_KEY_${i}`];
        if (key) keys.push(key);
    }
    return keys;
};

module.exports = async (req, res) => {
    // Run CORS
    await new Promise((resolve, reject) => {
        corsHandler(req, res, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Route: /api/ai
    if (req.url.includes('/api/ai') && req.method === 'POST') {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt missing hai bhai!" });

        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) return res.status(500).json({ error: "No API Keys found in .env" });

        // Shuffle keys to start from a random one (Load Balancing)
        let keysToTry = [...apiKeys].sort(() => Math.random() - 0.5);
        let lastError = null;

        for (const key of keysToTry) {
            try {
                // Gemini 1.5 Flash (Ya 2.0/2.5 as per your requirement)
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
                
                const response = await axios.post(url, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, { timeout: 10000 }); // 10s timeout

                // Agar success hai toh result bhej do
                return res.json({ 
                    answer: response.data.candidates[0].content.parts[0].text,
                    status: "success"
                });

            } catch (err) {
                lastError = err;
                const status = err.response ? err.response.status : null;
                
                // Agar 429 (Rate Limit) ya 503 (Busy) hai, toh loop continue karega (Next Key)
                if (status === 429 || status === 503 || status === 504) {
                    console.log(`Key ${key.substring(0, 5)}... limited. Trying next key.`);
                    continue; 
                } else {
                    // Agar koi aur error hai (like Invalid Key), tab bhi next try karenge
                    continue;
                }
            }
        }

        // Agar saari keys fail ho jayein
        return res.status(500).json({ 
            error: "Saari 7 keys rate limited hain. Thoda wait karo bhai.",
            details: lastError.message 
        });
    }

    // Default Route
    res.json({ message: "ScholarFlow Backend Running 🚀", totalKeys: getApiKeys().length });
};
