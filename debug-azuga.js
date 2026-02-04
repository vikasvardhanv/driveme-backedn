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
        const authPayload = { clientId, userName: username, password };
        const authRes = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(authPayload)
        });

        const authBody = await authRes.json();
        console.log('Auth Response:', JSON.stringify(authBody, null, 2));

        const token = (authBody.data && authBody.data.access_token) || authBody.access_token;

        if (!token) {
            console.error('❌ No token found!');
            return;
        }
        console.log('✅ Token received:', token);

        // 2. Fetch Data (V3 Trackees)
        const dataUrl = 'https://services.azuga.com/azuga-ws-oauth/v3/trackees';
        console.log(`\n--- 2. Fetching Data from ${dataUrl} ---`);

        // Test K: Authorization: <token> (As per user curl)
        console.log('\n--- Test K: Authorization: <token> (Raw) ---');
        const resK = await fetch(dataUrl, {
            method: 'POST', // User curl said POST
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({}) // User curl said data '{}'
        });
        console.log(`Status: ${resK.status}`);
        console.log('Body:', (await resK.text()).substring(0, 500));

        // Test L: Authorization: Bearer <token> (Standard)
        console.log('\n--- Test L: Authorization: Bearer <token> ---');
        const resL = await fetch(dataUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({})
        });
        console.log(`Status: ${resL.status}`);
        if (resL.status === 200) {
            const body = await resL.json();
            if (body.data && body.data.length > 0) {
                console.log('First Vehicle Object:', JSON.stringify(body.data[0], null, 2));
            } else {
                console.log('Body:', JSON.stringify(body).substring(0, 500));
            }
        } else {
            console.log('Body:', (await resL.text()).substring(0, 500));
        }

        // Test N: V3 Users
        const usersUrl = 'https://services.azuga.com/azuga-ws-oauth/v3/users';
        console.log(`\n--- Test N: V3 Users POST to ${usersUrl} ---`);
        const resN = await fetch(usersUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({})
        });
        console.log(`Status: ${resN.status}`);
        if (resN.status === 200) console.log('Body:', (await resN.text()).substring(0, 500));
        else console.log('Error Body:', (await resN.text()).substring(0, 200));

        // Test O: V3 Drivers (maybe query param needed?)
        const driversUrl = 'https://services.azuga.com/azuga-ws-oauth/v3/users?type=driver'; // Guessing param
        console.log(`\n--- Test O: V3 Users (Driver param) POST ---`);
        const resO = await fetch(driversUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({})
        });
        console.log(`Status: ${resO.status}`);

        // Test M: GET method (just in case)
        console.log('\n--- Test M: GET Method ---');
        const resM = await fetch(dataUrl, {
            method: 'GET',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        console.log(`Status: ${resM.status}`);
        if (resM.status !== 404 && resM.status !== 405) console.log('Body:', (await resM.text()).substring(0, 500));

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

debugAzuga();
