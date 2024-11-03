// request-token.js

import jwt from 'jsonwebtoken';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { expirationInSeconds = 86400 } = req.body; // Default: 1 day

    // Create a payload with expiration
    const payload = {
        exp: Math.floor(Date.now() / 1000) + expirationInSeconds,
        // You can add more claims here if needed
    };

    // Sign the token
    const token = jwt.sign(payload, process.env.JWT_SECRET);

    res.status(200).json({ token });
}
