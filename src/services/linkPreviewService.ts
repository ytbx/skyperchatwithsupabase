import { supabase } from '../lib/supabase';

export interface LinkMetadata {
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
    url: string;
}

const previewCache: Record<string, LinkMetadata> = {};

export const fetchLinkMetadata = async (url: string): Promise<LinkMetadata | null> => {
    if (previewCache[url]) {
        return previewCache[url];
    }

    try {
        const { data, error } = await supabase.functions.invoke('get-link-preview', {
            body: { url },
        });

        if (error) {
            console.error('Error fetching link preview:', error);
            return null;
        }

        if (data) {
            previewCache[url] = data;
            return data;
        }

        return null;
    } catch (error) {
        console.error('Failed to fetch link preview:', error);
        return null;
    }
};
