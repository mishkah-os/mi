
import http from 'http';

const url = 'http://127.0.0.1:3200/api/branches/dar/modules/pos';

console.log('Fetching', url);

http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            if (res.statusCode !== 200) {
                console.error('Error Status:', res.statusCode);
                console.error('Body:', data.slice(0, 500));
                return;
            }
            const json = JSON.parse(data);
            const tables = json.tables || (json.modules && json.modules.pos ? json.modules.pos.tables : {});
            const headers = tables.order_header || [];
            console.log('Order Headers Count:', headers.length);

            const versions = headers.map(h => ({ id: h.id, version: h.version }));
            console.log('Sample Versions:', versions.slice(0, 5));

            const missingVersion = headers.filter(h => h.version === undefined);
            console.log('Records missing version:', missingVersion.length);

            if (missingVersion.length > 0) {
                console.log('Example missing version:', missingVersion[0]);
            }

            if (json.version) {
                console.log('Module Version:', json.version);
            }

        } catch (err) {
            console.error('Failed:', err);
        }
    });
}).on('error', (err) => {
    console.error('Request Error:', err);
});
