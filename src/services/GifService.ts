// Tenor API v1 Interface
export interface TenorMediaObject {
    url: string;
    dims: [number, number];
    preview: string;
    size: number;
}

export interface TenorGifV1 {
    id: string;
    title: string;
    content_description: string;
    itemurl: string;
    media: {
        gif: TenorMediaObject;
        tinygif: TenorMediaObject;
        mediumgif: TenorMediaObject;
        mp4: TenorMediaObject;
    }[];
}

export interface TenorResponseV1 {
    results: TenorGifV1[];
    next: string;
}

// Unified interface for our app (maps v1 to what the component expects)
export interface TenorGif {
    id: string;
    title: string;
    content_description: string;
    itemurl: string;
    media_formats: {
        tinygif: {
            url: string;
            dims: [number, number];
        };
        gif: {
            url: string;
            dims: [number, number];
        };
    };
}

export interface TenorResponse {
    results: TenorGif[];
    next: string;
}

class GifService {
    private API_KEY = 'LIVDSRZULELA'; // Public test key for Tenor v1
    private CLIENT_KEY = 'SkyperChat';
    private BASE_URL = 'https://g.tenor.com/v1';

    async getTrendingGifs(limit: number = 20, pos?: string): Promise<TenorResponse> {
        try {
            const params = new URLSearchParams({
                key: this.API_KEY,
                limit: limit.toString(),
                media_filter: 'minimal',
            });

            if (pos) params.append('pos', pos);

            const response = await fetch(`${this.BASE_URL}/trending?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch trending GIFs');

            const data: TenorResponseV1 = await response.json();
            return this.mapV1ToV2Style(data);
        } catch (error) {
            console.error('[GifService] Error fetching trending GIFs:', error);
            // Return empty result to avoid crashing UI
            return { results: [], next: '' };
        }
    }

    async searchGifs(query: string, limit: number = 20, pos?: string): Promise<TenorResponse> {
        try {
            const params = new URLSearchParams({
                q: query,
                key: this.API_KEY,
                limit: limit.toString(),
                media_filter: 'minimal',
            });

            if (pos) params.append('pos', pos);

            const response = await fetch(`${this.BASE_URL}/search?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to search GIFs');

            const data: TenorResponseV1 = await response.json();
            return this.mapV1ToV2Style(data);
        } catch (error) {
            console.error('[GifService] Error searching GIFs:', error);
            return { results: [], next: '' };
        }
    }

    private mapV1ToV2Style(data: TenorResponseV1): TenorResponse {
        return {
            next: data.next,
            results: data.results.map(item => ({
                id: item.id,
                title: item.title,
                content_description: item.content_description,
                itemurl: item.itemurl,
                media_formats: {
                    gif: {
                        url: item.media[0].gif.url,
                        dims: item.media[0].gif.dims
                    },
                    tinygif: {
                        url: item.media[0].tinygif.url,
                        dims: item.media[0].tinygif.dims
                    }
                }
            }))
        };
    }
}

export const gifService = new GifService();
