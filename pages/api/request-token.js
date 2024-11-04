// request-token.js

import jwt from 'jsonwebtoken';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    } 

    const expirationInSeconds = 2592000;
    const password = req.body.password;

    console.log('password',password)

    if (password === undefined) {
        return
    } else if (password !== process.env.PASSWORD) {
        return res.status(401).json({ message: 'Unauthorized' });
    } 

    const payload = {
        exp: Math.floor(Date.now() / 1000) + expirationInSeconds,
        // You can add more claims here if needed
    };

    // Sign the token
    const token = jwt.sign(payload, process.env.JWT_SECRET);

    res.status(200).json({ token });
}
