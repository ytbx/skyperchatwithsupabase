//#region src/index.d.ts
type Window = {
  processId: string;
  title: string;
  hwnd: string;
};
/**
 * Sets the root directory path where executables are located.
 * @param root - The absolute path to the executables root directory.
 */
declare function setExecutablesRoot(root: string): void;
/**
 * Returns the absolute path to the ApplicationLoopback executable binary.
 * @returns {string} The resolved absolute path to the ApplicationLoopback executable.
 */
declare function getLoopbackBinaryPath(): string;
/**
 * Returns the absolute path to the ProcessList executable binary.
 * @returns {string} The resolved absolute path to the ProcessList executable.
 */
declare function getProcessListBinaryPath(): string;
/**
 * Retrieves a list of active window process IDs and their titles by spawning an external binary.
 * @returns A promise that resolves to an array of `Window` objects, each containing a `processId` and a `title`.
 * @example
 * const windows = await getActiveWindowProcessIds();
 * windows.forEach(win => {
 *   console.log(win.processId, win.title);
 * });
 */
declare function getActiveWindowProcessIds(): Promise<Window[]>;
/**
 * Starts capturing audio for a given process ID by spawning an external binary.
 *
 * @param processId - The unique identifier for the process whose audio should be captured.
 * @param options - Configuration options for the audio capture.
 * @param options.onData - Optional callback invoked with audio data as a `Uint8Array` whenever new data is available.
 * @param options.mode - Optional capture mode: 'include' (only this process) or 'exclude' (all but this process). Defaults to 'include'.
 * @throws {Error} If an audio capture for the specified `processId` is already running.
 * @returns The `processId` for which audio capture has started.
 */
declare function startAudioCapture(processId: string, options: {
  onData?: (data: Uint8Array) => void;
  mode?: 'include' | 'exclude';
}): string;
/**
 * Stops the audio capture process associated with the given process ID.
 * @param processId - The unique identifier of the audio capture process to stop.
 * @returns `true` if the process was found and stopped, otherwise `false`.
 */
declare function stopAudioCapture(processId: string): boolean;
/**
 * Convenience function to start capturing all system audio EXCEPT a specific process.
 */
declare function captureSystemAudioExcluding(processIdToExclude: string, options: {
  onData: (data: Uint8Array) => void;
}): string;
/**
 * Helper to find a process ID for a given window handle (HWND).
 * HWND can be passed as a number or a string.
 */
declare function getWindowPid(hwnd: string | number): Promise<string | null>;
//#endregion
export { Window, captureSystemAudioExcluding, getActiveWindowProcessIds, getLoopbackBinaryPath, getProcessListBinaryPath, getWindowPid, setExecutablesRoot, startAudioCapture, stopAudioCapture };