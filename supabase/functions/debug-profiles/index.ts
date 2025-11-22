Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        console.log('Debugging profiles table...');

        // Get all profiles to check what data exists
        const profilesResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!profilesResponse.ok) {
            const errorText = await profilesResponse.text();
            throw new Error(`Failed to fetch profiles: ${errorText}`);
        }

        const profiles = await profilesResponse.json();
        
        // Get auth users
        const authUsersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        let authUsers = [];
        if (authUsersResponse.ok) {
            const authData = await authUsersResponse.json();
            authUsers = authData.users || [];
        }

        const result = {
            data: {
                profiles: profiles,
                authUsers: authUsers,
                summary: {
                    totalProfiles: profiles.length,
                    totalAuthUsers: authUsers.length,
                    profilesWithUsername: profiles.filter(p => p.username).length,
                    profilesMissingUsername: profiles.filter(p => !p.username).length,
                    testUsers: {
                        'yusuftalhabarlas@gmail.com': null,
                        'ytbx461@gmail.com': null
                    }
                }
            }
        };

        // Check specific test users
        for (const profile of profiles) {
            if (profile.email === 'yusuftalhabarlas@gmail.com') {
                result.data.summary.testUsers['yusuftalhabarlas@gmail.com'] = {
                    id: profile.id,
                    username: profile.username,
                    email: profile.email
                };
            }
            if (profile.email === 'ytbx461@gmail.com') {
                result.data.summary.testUsers['ytbx461@gmail.com'] = {
                    id: profile.id,
                    username: profile.username,
                    email: profile.email
                };
            }
        }

        console.log('Debug result:', JSON.stringify(result, null, 2));

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Debug profiles error:', error);

        const errorResponse = {
            error: {
                code: 'DEBUG_PROFILES_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
