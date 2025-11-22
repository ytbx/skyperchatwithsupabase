import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

// Manually parse .env
const envPath = path.resolve(process.cwd(), '.env');
let envConfig = {};

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
            envConfig[key] = value;
        }
    });
} catch (e) {
    console.error('Error reading .env file:', e);
}

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable(tableName) {
    console.log(`\n--- Inspecting table: ${tableName} ---`);

    // Try to select one row to see columns
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

    if (error) {
        console.error(`Error accessing ${tableName}:`, error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]).join(', '));
        console.log('Sample row:', JSON.stringify(data[0], null, 2));
    } else {
        console.log(`Table ${tableName} is empty or accessible but no data found.`);
        // If empty, we can't easily see columns with just select(*), but it confirms access.
    }
}

async function main() {
    console.log('Starting database inspection...');

    const tables = [
        'server_users',
        'server_roles',
        'server_user_roles',
        'server_invites',
        'servers',
        'channels',
        'profiles'
    ];

    for (const table of tables) {
        await inspectTable(table);
    }

    console.log('\n--- Checking RLS Policies ---');
    // Note: querying pg_policies might not be allowed for anon, but let's try
    // We can't query system tables directly via postgrest usually.
    // Instead, we can try to infer from behavior or just skip this if it fails.

    // Since we can't query pg_policies directly via client, we rely on the fact that we could read the tables above.
    // If we could read 'server_invites', then RLS allows it.
}

main();
