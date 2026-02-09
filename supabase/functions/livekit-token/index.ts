import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

// LiveKit Token Generation Edge Function
// Generates access tokens for voice channel connections

// Removed global consts to handle them inside Deno.serve for better error reporting

// Simple JWT creation for LiveKit (compatible with Deno)
async function createLiveKitToken(
    identity: string,
    roomName: string,
    metadata: Record<string, any>,
    apiKey: string,
    apiSecret: string
): Promise<string> {
    const header = {
        alg: "HS256",
        typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: apiKey,
        sub: identity,
        iat: now,
        nbf: now,
        exp: now + 86400, // 24 hours
        jti: identity + "-" + now,
        video: {
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        },
        metadata: JSON.stringify(metadata),
    };

    function base64UrlEncode(data: Uint8Array): string {
        const base64 = btoa(String.fromCharCode(...data));
        return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function stringToUint8Array(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

    const encodedHeader = base64UrlEncode(stringToUint8Array(JSON.stringify(header)));
    const encodedPayload = base64UrlEncode(stringToUint8Array(JSON.stringify(payload)));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Create HMAC-SHA256 signature
    const key = await crypto.subtle.importKey(
        "raw",
        stringToUint8Array(apiSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        stringToUint8Array(signatureInput)
    );

    const encodedSignature = base64UrlEncode(new Uint8Array(signature));

    return `${signatureInput}.${encodedSignature}`;
}

Deno.serve(async (req: Request) => {
    // Shared CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    try {
        const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY")?.trim();
        const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")?.trim();
        const LIVEKIT_WS_URL = Deno.env.get("LIVEKIT_WS_URL")?.trim() || "wss://ovox2-0yrakl4s.livekit.cloud";

        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
            console.error("Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET environment variables");
            return new Response(
                JSON.stringify({ error: "Server configuration error: Missing LiveKit credentials" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Verify user authentication
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "No authorization header" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Get request body
        const { channelId } = await req.json();
        if (!channelId) {
            return new Response(JSON.stringify({ error: "channelId is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Get user profile for metadata
        const { data: profile } = await supabase
            .from("profiles")
            .select("username, display_name, avatar_url")
            .eq("id", user.id)
            .single();

        // Create LiveKit token
        const roomName = `voice-channel-${channelId}`;
        const metadata = {
            username: profile?.username || "Unknown",
            displayName: profile?.display_name || profile?.username || "Unknown",
            avatarUrl: profile?.avatar_url || null,
            channelId: channelId,
        };

        // Reuse local consts for token generation
        const token = await createLiveKitToken(user.id, roomName, metadata, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        return new Response(
            JSON.stringify({
                token,
                wsUrl: LIVEKIT_WS_URL,
                roomName,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error generating LiveKit token:", error);
        return new Response(
            JSON.stringify({ error: "Failed to generate token", details: (error as Error).message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
