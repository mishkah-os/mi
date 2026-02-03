
// Paste this into the browser console to verify the adapter

// 1. Initialize with REAL Clinic IDs
firebase.initializeApp({
    branchId: 'pt',
    moduleId: 'clinic',
    lang: 'ar'
});

const db = firebase.database();

// 2. Test Push (Add Patient to 'clinic_patients')
// Using a real table ensures we don't hit permission/schema errors
const ref = await db.ref('clinic_patients').push({
    name: 'Test Patient Adapter',
    phone: '010xxxxxxx',
    notes: 'Created via Mishkah Firebase Adapter'
});
const newId = ref.key;
console.log('Created Patient ID:', newId);

// 3. Test Set (Upsert extra data - technically "fields" on the patient record)
// Note: In strict Mishkah, we usually just update fields on the record.
// This example updates the 'address' field on the patient.
await db.ref(`clinic_patients/${newId}/address`).set('Cairo, Egypt');
console.log('Address Set');

// 4. Test Update (Partial update)
await db.ref(`clinic_patients/${newId}`).update({ status: 'active' });
console.log('Patient Updated');

// 5. Test Read (Ref)
const snap = await db.ref(`clinic_patients/${newId}`).once('value');
console.log('Read Patient:', snap.val());

// 6. Test Watch (Table)
const unsub = db.ref('clinic_patients').on('value', (s) => {
    const list = [];
    s.forEach(c => list.push(c.val()));
    console.log('Patients List Update (Count):', list.length);
});

// 7. Cleanup
setTimeout(() => {
    unsub();
    console.log('Test Complete');
}, 5000);
