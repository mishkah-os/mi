import http from 'http';
import assert from 'assert';

const HOST = '127.0.0.1';
const PORT = 8080;
const BRANCH_ID = 'pt';
const MODULE_ID = 'pos';

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        // Likely empty body
                        resolve({});
                    }
                } else {
                    reject(new Error(`Request failed: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTest() {
    console.log('🚀 Starting Scheduled Order Verification (Native HTTP)...');

    try {
        // 1. Create a Pending Schedule
        console.log('\n--- Step 1: Create Schedule ---');
        const createPayload = {
            customerId: 'customer_001',
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            items: [
                { id: 'item_1', name: 'Test Item 1', price: 100, qty: 1 }
            ],
            duration: 60,
            addressId: 'addr_123'
        };

        const createData = await request('POST', `/api/branches/${BRANCH_ID}/modules/${MODULE_ID}/schedule`, createPayload);
        const scheduleId = createData.id;
        console.log(`✅ Created Schedule ID: ${scheduleId}`);
        assert.strictEqual(createData.customer_address_id, 'addr_123', 'Address ID mismatch on create');

        // 2. Update the Schedule
        console.log('\n--- Step 2: Update Schedule ---');
        const updatePayload = {
            customerId: 'customer_001',
            scheduledAt: new Date(Date.now() + 172800000).toISOString(),
            items: [
                { id: 'item_1', name: 'Test Item 1', price: 100, qty: 2 }
            ],
            duration: 90,
            addressId: 'addr_456'
        };

        const updateData = await request('PUT', `/api/branches/${BRANCH_ID}/modules/${MODULE_ID}/schedule/${scheduleId}`, updatePayload);
        console.log(`✅ Updated Schedule. New Address: ${updateData.customer_address_id}`);
        assert.strictEqual(updateData.customer_address_id, 'addr_456', 'Address ID mismatch on update');

        // 3. Confirm the Schedule
        console.log('\n--- Step 3: Confirm Schedule ---');
        const confirmData = await request('POST', `/api/branches/${BRANCH_ID}/modules/${MODULE_ID}/schedule/${scheduleId}/confirm`, {});
        console.log(`✅ Confirmed Schedule. Order Created: ${confirmData.orderId}`);

        console.log('\n🎉 Verification Successful! Full lifecycle validated.');

    } catch (err) {
        console.error('❌ Test Failed:', err.message);
        process.exit(1);
    }
}

runTest();
