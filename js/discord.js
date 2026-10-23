import { auth } from '../firebase-config.js';
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// same client ID as in functions/index.js
export const DISCORD_CLIENT_ID = '1560332678409232385';
const FUNCTION_URL = 'https://us-central1-kaizolist.cloudfunctions.net/discordAuth';

const redirectUri = () => location.origin + '/Discord/';

export function startDiscordSignIn() {
    const state = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    try {
        sessionStorage.setItem('kl_discord_state', state);
        sessionStorage.setItem('kl_discord_return', location.pathname + location.search + location.hash);
    } catch { }
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(),
        scope: 'identify', state, prompt: 'none',
    });
    location.href = 'https://discord.com/oauth2/authorize?' + params;
    return new Promise(() => { });
}

export async function finishDiscordSignIn() {
    const q = new URLSearchParams(location.search);
    let expected = null, back = '/';
    try {
        expected = sessionStorage.getItem('kl_discord_state');
        back = sessionStorage.getItem('kl_discord_return') || '/';
        sessionStorage.removeItem('kl_discord_state');
    } catch { }
    if (q.get('error')) throw Object.assign(new Error('cancelled'), { back });
    if (!q.get('code') || !expected || q.get('state') !== expected) throw Object.assign(new Error('state'), { back });

    const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: q.get('code'), redirectUri: redirectUri() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw Object.assign(new Error(data.error || 'failed'), { back });
    await signInWithCustomToken(auth, data.token);
    return back.startsWith('/') && !back.startsWith('//') ? back : '/';
}
