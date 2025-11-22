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
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            envConfig[key] = value;
        }
    });
} catch (e) {
    console.error('Error reading .env file:', e);
}

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function testJoin() {
    console.log('Testing join query...');

    // 1. Get an existing invite code first to test with
    const { data: invites, error: listError } = await supabase
        .from('server_invites')
        .select('invite_code')
        .limit(1);

    if (listError || !invites || invites.length === 0) {
        console.error('Could not find any invites to test with:', listError);
        return;
    }

    const code = invites[0].invite_code;
    console.log(`Testing with code: "${code}"`);

    // 2. Try the exact query from the app
    const { data: invite, error: inviteError } = await supabase
        .from('server_invites')
        .select('*, server:servers(*)')
        .eq('invite_code', code)
        .maybeSingle();

    if (inviteError) {
        console.error('Query Error:', inviteError);
    } else if (!invite) {
        console.error('Result: Invite NOT FOUND (null)');
    } else {
        console.log('Result: Invite FOUND');
        console.log('Invite ID:', invite.id);
        console.log('Server Object:', invite.server);

        if (!invite.server) {
            console.warn('WARNING: Server object is null! RLS on servers table might be blocking access.');
        }
    }
}

testJoin();
