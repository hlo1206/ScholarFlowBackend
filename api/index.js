const axios = require('axios');
const cors = require('cors');

// CORS Setup
const corsHandler = cors({ origin: true });

// --- CONFIG (TERA DATA) ---
// Pro-tip: Inhe Vercel ke Environment Variables mein daalna secure hota hai
const S_URL = process.env.SUPABASE_URL || "https://cctrgxbnntwjmjvxtnpk.supabase.co";
const S_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdHJneGJubnR3am1qdnh0bnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDA1NjQsImV4cCI6MjA4NzU3NjU2NH0.8YBc6pLD4rcywYmNdYj5u77H_05pRZKy-x4Nfm39dYo";

// AI Behavior (System Prompt)
const SYSTEM_INSTRUCTION = "You are 'ScholarFlow AI', a brilliant and friendly student assistant. Your goal is to solve doubts, explain topics simply, and help with homework in Hinglish. You are polite, professional, and encouraging. Always identify as ScholarFlow AI.";

// Helper: Get API Keys from Vercel
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
    // 1. ROUTE: AUTH & OTP PROXY (Signup, Login, Verify)
    // ---------------------------------------------------------
    if (path.includes('/api/auth') && req.method === 'POST') {
        const { email, password, token, type } = req.body; 

        try {
            let endpoint, payload;
            if (type === 'signup') {
                endpoint = '/auth/v1/signup';
                payload = { email, password };
            } else if (type === 'verify') {
                endpoint = '/auth/v1/verify';
                payload = { email, token, type: 'signup' };
            } else {
                endpoint = '/auth/v1/token?grant_type=password';
                payload = { email, password };
            }

            const supabaseRes = await axios.post(`${S_URL}${endpoint}`, payload, {
                headers: { 'apikey': S_KEY, 'Content-Type': 'application/json' }
            });
            return res.json(supabaseRes.data);
        } catch (err) {
            return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
        }
    }

    // ---------------------------------------------------------
    // 2. ROUTE: AI CHAT (Text + Image + 7-Key Rotation)
    // ---------------------------------------------------------
    if (path.includes('/api/ai') && req.method === 'POST') {
        const { prompt, history, image, mimeType } = req.body;
        
        // As per your order: Using Gemini 2.5 Flash
        const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
        const keys = getApiKeys();

        if (keys.length === 0) return res.status(500).json({ error: "API Keys missing in Vercel!" });

        // Build Gemini Contents (History + Current Message)
        let contents = [];

        // 1. Add Chat History
        if (history && Array.isArray(history)) {
            contents = history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            }));
        }

        // 2. Build Current User Message Parts
        const currentUserParts = [
            { text: `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${prompt}` }
        ];

        // 3. Add Image if provided (Base64)
        if (image) {
            currentUserParts.push({
                inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: image // Frontend se bina prefix wala base64 bhejna
                }
            });
        }

        contents.push({
            role: "user",
            parts: currentUserParts
        });

        // Key Rotation Logic
        let shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
        let lastErr = null;

        for (const key of shuffledKeys) {
            try {
                const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
                
                // Note: Multi-modal requests (images) take longer, so timeout is 30s
                const response = await axios.post(aiUrl, { contents }, { timeout: 30000 });

                if (response.data.candidates && response.data.candidates[0].content) {
                    return res.json({
                        answer: response.data.candidates[0].content.parts[0].text,
                        status: "success",
                        model: MODEL
                    });
                }
            } catch (err) {
                lastErr = err;
                console.log(`Key Failed: ${key.substring(0, 8)}... Error: ${err.message}`);
                continue; 
            }
        }

        return res.status(500).json({ 
            error: "Bhai saari API keys thak gayi hain. Thodi der baad try kar.", 
            details: lastErr?.response?.data || lastErr?.message 
        });
    }

    // DEFAULT ROUTE (Health Check)
    res.json({ 
        message: "ScholarFlow Pro Engine Live 🚀", 
        engine: "Gemini 2.5 Flash",
        keys_active: getApiKeys().length,
        features: ["Auth Proxy", "Multi-modal AI", "Key Rotation"]
    });
};
