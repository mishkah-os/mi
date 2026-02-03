// Knex Configuration
// Isolated for CLINIC module only - POS remains untouched
export default {
    development: {
        client: 'better-sqlite3',
        connection: {
            filename: './data/clinic-knex.sqlite' // Separate DB for clinic!
        },
        useNullAsDefault: true,
        migrations: {
            directory: './data/migrations/clinic'
        },
        seeds: {
            directory: './data/seeds/clinic'
        }
    },

    test: {
        client: 'better-sqlite3',
        connection: {
            filename: ':memory:'
        },
        useNullAsDefault: true
    },

    production: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'clinic_production'
        },
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            directory: './data/migrations/clinic'
        }
    }
};
