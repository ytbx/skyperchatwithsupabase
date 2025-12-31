declare module '@skyperchat/audio-loopback' {
    export function setExecutablesRoot(root: string): void;
    export function captureSystemAudioExcluding(processIdToExclude: string, options: { onData: (data: Uint8Array) => void }): string;
    export function stopAudioCapture(processId: string): boolean;
    export function startAudioCapture(processId: string, options: { onData?: (data: Uint8Array) => void; mode?: 'include' | 'exclude' }): string;
}
