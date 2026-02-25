const axios = require('axios');
const cors = require('cors');

// CORS setup taaki InfinityFree aur Mobile App se connection na tute
const corsHandler = cors({ origin: true });

// TERA SUPABASE DATA (PRO-FIX)
const S_URL = "https://cctrgxbnntwjmjvxtnpk.supabase.co";
const S_KEY = "sb_publishable_3N6MyW8hgvFcJg5zyqj5xA_OtYygV2H";

// Gemini Behavior
const SYSTEM_PROMPT = "You are 'ScholarFlow AI', a friendly student assistant. Help with homework, explain notes, and solve doubts in Hinglish. You are smart, professional, and encouraging.";

// Helper: Get API Keys from Vercel Env
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

    const urlPath = req.url;

    // ---------------------------------------------------------
    // 1. ROUTE: AUTH PROXY (Fixes InfinityFree "Failed to Fetch")
    // ---------------------------------------------------------
    if (urlPath.includes('/api/auth') && req.method === 'POST') {
        const { email, password, type } = req.body; // type: 'login' or 'signup'
        
        try {
            // Agar signup hai toh /signup, warna /token (login)
            const endpoint = type === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
            
            const supabaseRes = await axios.post(`${S_URL}${endpoint}`, 
                { email, password },
                { 
                    headers: { 
                        'apikey': S_KEY, 
                        'Content-Type': 'application/json' 
                    } 
                }
            );

            return res.json(supabaseRes.data);
        } catch (err) {
            console.error("Auth Proxy Error:", err.response?.data || err.message);
            return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
        }
    }

    // ---------------------------------------------------------
    // 2. ROUTE: AI CHAT (Gemini Multi-Key Rotation)
    // ---------------------------------------------------------
    if (urlPath.includes('/api/ai') && req.method === 'POST') {
        const { prompt, history } = req.body;
        const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        const keys = getApiKeys();

        if (keys.length === 0) return res.status(500).json({ error: "No API Keys found!" });

        // Shuffle keys for load balancing
        let shuffledKeys = [...keys].sort(() => Math.random() - 0.5);

        // Prepare AI Content with History
        let contents = [];
        if (history && Array.isArray(history)) {
            contents = history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            }));
        }
        contents.push({ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${prompt}` }] });

        for (const key of shuffledKeys) {
            try {
                const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
                const aiRes = await axios.post(aiUrl, { contents }, { timeout: 10000 });

                return res.json({ 
                    answer: aiRes.data.candidates[0].content.parts[0].text,
                    status: "success",
                    model: MODEL
                });
            } catch (err) {
                console.log(`Key ${key.substring(0,5)} failed, trying next...`);
                continue; // Rate limit reached, try next key
            }
        }
        return res.status(500).json({ error: "All AI keys are busy. Try again later." });
    }

    // DEFAULT ROUTE
    res.json({ 
        message: "ScholarFlow Engine is Live 🚀", 
        auth_proxy: "Active", 
        ai_rotation: "Active",
        keys_loaded: getApiKeys().length 
    });
};
