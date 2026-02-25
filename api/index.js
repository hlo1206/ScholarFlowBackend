const axios = require('axios');
const cors = require('cors');

// CORS Setup: InfinityFree aur Mobile App se baat karne ke liye
const corsHandler = cors({ origin: true });

// --- CONFIG (TERA DATA) ---
const S_URL = "https://cctrgxbnnntwjmjvxtnpk.supabase.co"; // Corrected URL (3 'n')
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdHJneGJubnR3am1qdnh0bnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDA1NjQsImV4cCI6MjA4NzU3NjU2NH0.8YBc6pLD4rcywYmNdYj5u77H_05pRZKy-x4Nfm39dYo";

// AI Behavior (System Prompt)
const SYSTEM_INSTRUCTION = "You are 'ScholarFlow AI', a brilliant and friendly student assistant. Your goal is to solve doubts, explain topics simply, and help with homework in Hinglish. You are polite, professional, and encouraging. Always identify as ScholarFlow AI.";

// Helper: Get up to 7 Keys from Vercel Environment Variables
const getApiKeys = () => {
    const keys = [];
    for (let i = 1; i <= 7; i++) {
        const k = process.env[`GEMINI_KEY_${i}`];
        if (k) keys.push(k);
    }
    return keys;
};

module.exports = async (req, res) => {
    // Run CORS
    await new Promise((resolve, reject) => {
        corsHandler(req, res, (err) => err ? reject(err) : resolve());
    });

    if (req.method === 'OPTIONS') return res.status(200).end();

    const path = req.url;

    // ---------------------------------------------------------
    // 1. ROUTE: AUTH & OTP PROXY
    // ---------------------------------------------------------
    if (path.includes('/api/auth') && req.method === 'POST') {
        const { email, password, token, type } = req.body; 
        // types: 'login', 'signup', 'verify'

        try {
            let endpoint, payload;

            if (type === 'signup') {
                endpoint = '/auth/v1/signup';
                payload = { email, password };
            } else if (type === 'verify') {
                endpoint = '/auth/v1/verify';
                payload = { email, token, type: 'signup' }; // Supabase default signup type
            } else {
                endpoint = '/auth/v1/token?grant_type=password';
                payload = { email, password };
            }

            const supabaseRes = await axios.post(`${S_URL}${endpoint}`, payload, {
                headers: { 
                    'apikey': S_KEY, 
                    'Content-Type': 'application/json' 
                }
            });

            return res.json(supabaseRes.data);
        } catch (err) {
            console.error("Auth Error:", err.response?.data || err.message);
            return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
        }
    }

    // ---------------------------------------------------------
    // 2. ROUTE: AI CHAT (7-KEY ROTATION + HISTORY)
    // ---------------------------------------------------------
    if (path.includes('/api/ai') && req.method === 'POST') {
        const { prompt, history } = req.body;
        const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // Vercel Dashboard mein 'gemini-2.0-flash' set karna
        const keys = getApiKeys();

        if (keys.length === 0) return res.status(500).json({ error: "API Keys missing in Vercel!" });

        // Build Gemini Payload
        let contents = [];
        if (history && Array.isArray(history)) {
            contents = history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            }));
        }
        // Add current prompt with System Instruction
        contents.push({
            role: "user",
            parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${prompt}` }]
        });

        // Key Rotation Logic
        let shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
        let lastErr = null;

        for (const key of shuffledKeys) {
            try {
                const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
                const response = await axios.post(aiUrl, { contents }, { timeout: 12000 });

                return res.json({
                    answer: response.data.candidates[0].content.parts[0].text,
                    status: "success",
                    model: MODEL
                });
            } catch (err) {
                lastErr = err;
                console.log(`Key ${key.substring(0,5)} failed, trying next...`);
                continue; // Move to next key if rate limited
            }
        }

        return res.status(500).json({ 
            error: "All keys are busy. Try again.", 
            details: lastErr.response?.data || lastErr.message 
        });
    }

    // DEFAULT ROUTE
    res.json({ 
        message: "ScholarFlow Pro Engine Live 🚀", 
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        keys_active: getApiKeys().length,
        status: "All systems operational"
    });
};
