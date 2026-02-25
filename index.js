// --- api/index.js ---
const axios = require('axios');
const cors = require('cors');
const corsHandler = cors({ origin: true });

// AI ka behavior yahan set kar rahe hain (System Prompt)
const SYSTEM_INSTRUCTION = `You are 'ScholarFlow AI', a brilliant and friendly student assistant. 
Your goal is to solve doubts, explain complex topics simply, and help with homework. 
Always be encouraging. Use Hinglish (Hindi + English) if the user speaks in it. 
If there's an image, analyze it carefully to solve the problem.`;

module.exports = async (req, res) => {
    await new Promise((resolve, reject) => corsHandler(req, res, (err) => err ? reject(err) : resolve()));

    if (req.method === 'OPTIONS') return res.status(200).end();

    const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const API_KEYS = [];
    for (let i = 1; i <= 7; i++) { if (process.env[`GEMINI_KEY_${i}`]) API_KEYS.push(process.env[`GEMINI_KEY_${i}`]); }

    if (req.url.includes('/api/ai') && req.method === 'POST') {
        const { prompt, history, imageBase64 } = req.body; 
        // history: [{role: 'user', text: 'hi'}, {role: 'model', text: 'hello'}]

        let contents = [];
        
        // 1. Pehle puraani history dalo (agar hai toh)
        if (history && history.length > 0) {
            contents = history.map(item => ({
                role: item.role === 'user' ? 'user' : 'model',
                parts: [{ text: item.text }]
            }));
        }

        // 2. Ab naya message aur image (agar hai toh) dalo
        let currentParts = [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Question: ${prompt}` }];
        if (imageBase64) {
            currentParts.push({
                inlineData: { mimeType: "image/jpeg", data: imageBase64 }
            });
        }

        contents.push({ role: "user", parts: currentParts });

        let keysToTry = [...API_KEYS].sort(() => Math.random() - 0.5);
        for (const key of keysToTry) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`;
                const response = await axios.post(url, { contents }, { timeout: 15000 });

                return res.json({ 
                    answer: response.data.candidates[0].content.parts[0].text,
                    status: "success"
                });
            } catch (err) { continue; }
        }
        return res.status(500).json({ error: "All keys failed!" });
    }
    res.json({ message: "ScholarFlow Backend Pro Running 🚀" });
};