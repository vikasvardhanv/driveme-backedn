require('dotenv').config();

async function debugAzuga() {
    const clientId = process.env.AZUGA_CLIENT_ID;
    const username = process.env.AZUGA_USERNAME;
    const password = process.env.AZUGA_PASSWORD;

    const authUrl = 'https://auth.azuga.com/azuga-as/oauth2/login/oauthtoken.json?loginType=1';

    console.log('--- Config ---');
    console.log('ClientId:', clientId);
    console.log('Auth URL:', authUrl);

    try {
        // 1. Authenticate
        console.log('\n--- 1. Authenticating ---');
        const authRes = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, userName: username, password })
        });
        const authBody = await authRes.json();
        const token = (authBody.data && authBody.data.access_token) || authBody.access_token;

        if (!token) {
            console.error('❌ No token found!');
            return;
        }
        console.log('✅ Token received');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'cid': clientId
        };

        // Variant 1: Query Param access_token
        console.log('\n--- Variant 1: Query Param access_token ---');
        const url1 = `https://api.azuga.com/azuga-ws/v1/users.json?userType=driver&access_token=${token}`;
        console.log('URL:', url1);
        // Don't send Authorization header to avoid conflict, or send it too? Let's try without first.
        const res1 = await fetch(url1, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
        console.log('Status:', res1.status);
        console.log('Body:', (await res1.text()).substring(0, 500));

        // Variant 2: Query Param access_token + cid header
        console.log('\n--- Variant 2: Query Param + cid header ---');
        const res2 = await fetch(url1, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'cid': clientId
            }
        });
        console.log('Status:', res2.status);
        console.log('Body:', (await res2.text()).substring(0, 500));

        // Variant 3: Vehicles with GET + cid
        console.log('\n--- Variant 3: Vehicles GET + cid ---');
        const url3 = `https://api.azuga.com/azuga-ws/v1/vehicles.json`;
        const res3 = await fetch(url3, { method: 'GET', headers });
        console.log('Status:', res3.status);
        const text3 = await res3.text();
        console.log(`Body Length: ${text3.length}`);
        console.log('Body:', text3.substring(0, 500));

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

debugAzuga();
