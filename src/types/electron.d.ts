export interface DesktopCapturerSource {
    id: string;
    name: string;
    thumbnail: {
        toDataURL(): string;
    };
    display_id: string;
    appIcon: {
        toDataURL(): string;
    } | null;
}

declare global {
    interface Window {
        electron: {
            getDesktopSources: () => Promise<DesktopCapturerSource[]>;
        };
    }
}
