// lib/db.js
import sql from 'mssql';

// 🔥 Simple connection for Windows Authentication
const config = {
    server: 'KHETHA',
    database: 'InterviewCoach',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    authentication: {
        type: 'default'  // Windows Authentication
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

let pool = null;

export async function getPool() {
    if (!pool) {
        try {
            console.log('🔍 Connecting to SQL Server...');
            pool = await sql.connect(config);
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }
    return pool;
}