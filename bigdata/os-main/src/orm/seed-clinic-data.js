// Sample seed data for clinic database
// Run: node src/orm/seed-clinic-data.js

import knex from 'knex';
import knexConfig from '../../knexfile.js';

const db = knex(knexConfig.development);

console.log('🌱 Seeding clinic database...\n');

try {
    // 1. Languages
    await db('languages').insert([
        { id: 'ar', code: 'ar', name: 'العربية', direction: 'rtl', is_default: true, is_active: true },
        { id: 'en', code: 'en', name: 'English', direction: 'ltr', is_default: false, is_active: true }
    ]);
    console.log('✅ Languages seeded');

    // 2. Companies
    await db('companies').insert([
        { id: 'comp-1', tax_number: '123456789', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'comp-2', tax_number: '987654321', begin_date: new Date('2024-01-01').toISOString(), is_active: true }
    ]);

    await db('companies_lang').insert([
        { id: 'cl-1', companies_id: 'comp-1', lang: 'ar', name: 'شركة الأمل للرعاية الصحية', created_date: new Date().toISOString() },
        { id: 'cl-2', companies_id: 'comp-1', lang: 'en', name: 'Hope Healthcare Company', created_date: new Date().toISOString() },
        { id: 'cl-3', companies_id: 'comp-2', lang: 'ar', name: 'شركة النور الطبية', created_date: new Date().toISOString() },
        { id: 'cl-4', companies_id: 'comp-2', lang: 'en', name: 'Al-Nour Medical Company', created_date: new Date().toISOString() }
    ]);
    console.log('✅ Companies seeded');

    // 3. Branches
    await db('branches').insert([
        { id: 'branch-1', company_id: 'comp-1', code: 'MAIN-CAI', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'branch-2', company_id: 'comp-1', code: 'ALEX', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'branch-3', company_id: 'comp-2', code: 'MAN', begin_date: new Date('2024-01-01').toISOString(), is_active: true }
    ]);

    await db('branches_lang').insert([
        { id: 'bl-1', branches_id: 'branch-1', lang: 'ar', name: 'الفرع الرئيسي - القاهرة', created_date: new Date().toISOString() },
        { id: 'bl-2', branches_id: 'branch-1', lang: 'en', name: 'Main Branch - Cairo', created_date: new Date().toISOString() },
        { id: 'bl-3', branches_id: 'branch-2', lang: 'ar', name: 'فرع الإسكندرية', created_date: new Date().toISOString() },
        { id: 'bl-4', branches_id: 'branch-2', lang: 'en', name: 'Alexandria Branch', created_date: new Date().toISOString() },
        { id: 'bl-5', branches_id: 'branch-3', lang: 'ar', name: 'فرع المنصورة', created_date: new Date().toISOString() },
        { id: 'bl-6', branches_id: 'branch-3', lang: 'en', name: 'Mansoura Branch', created_date: new Date().toISOString() }
    ]);
    console.log('✅ Branches seeded');

    // 4. Clinic Specialties
    await db('clinic_specialties').insert([
        { id: 'spec-1', company_id: 'comp-1', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'spec-2', company_id: 'comp-1', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'spec-3', company_id: 'comp-1', begin_date: new Date('2024-01-01').toISOString(), is_active: true }
    ]);

    await db('clinic_specialties_lang').insert([
        { id: 'sl-1', specialty_id: 'spec-1', lang: 'ar', name: 'طب الأطفال', created_date: new Date().toISOString() },
        { id: 'sl-2', specialty_id: 'spec-1', lang: 'en', name: 'Pediatrics', created_date: new Date().toISOString() },
        { id: 'sl-3', specialty_id: 'spec-2', lang: 'ar', name: 'طب الباطنة', created_date: new Date().toISOString() },
        { id: 'sl-4', specialty_id: 'spec-2', lang: 'en', name: 'Internal Medicine', created_date: new Date().toISOString() },
        { id: 'sl-5', specialty_id: 'spec-3', lang: 'ar', name: 'الجراحة العامة', created_date: new Date().toISOString() },
        { id: 'sl-6', specialty_id: 'spec-3', lang: 'en', name: 'General Surgery', created_date: new Date().toISOString() }
    ]);
    console.log('✅ Specialties seeded');

    // 5. Users (Doctors)
    await db('users').insert([
        { id: 'user-1', username: 'dr.ahmed', company_id: 'comp-1', branch_id: 'branch-1', role: 'doctor', is_doctor: true, specialty: 'spec-1', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'user-2', username: 'dr.fatima', company_id: 'comp-1', branch_id: 'branch-2', role: 'doctor', is_doctor: true, specialty: 'spec-2', begin_date: new Date('2024-01-01').toISOString(), is_active: true },
        { id: 'user-3', username: 'dr.mohamed', company_id: 'comp-2', branch_id: 'branch-3', role: 'doctor', is_doctor: true, specialty: 'spec-3', begin_date: new Date('2024-01-01').toISOString(), is_active: true }
    ]);

    await db('users_lang').insert([
        { id: 'ul-1', users_id: 'user-1', lang: 'ar', name: 'د. أحمد محمود', created_date: new Date().toISOString() },
        { id: 'ul-2', users_id: 'user-1', lang: 'en', name: 'Dr. Ahmed Mahmoud', created_date: new Date().toISOString() },
        { id: 'ul-3', users_id: 'user-2', lang: 'ar', name: 'د. فاطمة حسن', created_date: new Date().toISOString() },
        { id: 'ul-4', users_id: 'user-2', lang: 'en', name: 'Dr. Fatima Hassan', created_date: new Date().toISOString() },
        { id: 'ul-5', users_id: 'user-3', lang: 'ar', name: 'د. محمد علي', created_date: new Date().toISOString() },
        { id: 'ul-6', users_id: 'user-3', lang: 'en', name: 'Dr. Mohamed Ali', created_date: new Date().toISOString() }
    ]);
    console.log('✅ Users seeded');

    console.log('\n🎉 Seeding complete!');
    console.log('📊 Summary:');
    console.log('  - 2 Languages');
    console.log('  - 2 Companies (4 translations)');
    console.log('  - 3 Branches (6 translations)');
    console.log('  - 3 Specialties (6 translations)');
    console.log('  - 3 Users (6 translations)');
    console.log('\nNow run: npm run clinic:test\n');

} catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error);
} finally {
    await db.destroy();
}
