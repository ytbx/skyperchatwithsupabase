import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { arch, platform } from "node:os";
import path from "node:path";

if (platform() !== "win32" || arch() !== "x64") {
   console.warn("This package is currently only available for Windows 10 x64 and later");
}

export type Window = {
   processId: string;
   title: string;
   hwnd: string;
};

let executableRoot = path.resolve(__dirname, "../", "bin");

/**
 * Sets the root directory path where executables are located.
 * @param root - The absolute path to the executables root directory.
 */
export function setExecutablesRoot(root: string) {
   executableRoot = root;
}

/**
 * Returns the absolute path to the ApplicationLoopback executable binary.
 * @returns {string} The resolved absolute path to the ApplicationLoopback executable.
 */
export function getLoopbackBinaryPath() {
   return path.resolve(executableRoot, `${platform()}-${arch()}`, "ApplicationLoopback.exe");
}

/**
 * Returns the absolute path to the ProcessList executable binary.
 * @returns {string} The resolved absolute path to the ProcessList executable.
 */
export function getProcessListBinaryPath() {
   return path.resolve(executableRoot, `${platform()}-${arch()}`, "ProcessList.exe");
}

/**
 * Retrieves a list of active window process IDs and their titles by spawning an external binary.
 * @returns A promise that resolves to an array of `Window` objects, each containing a `processId` and a `title`.
 * @example
 * const windows = await getActiveWindowProcessIds();
 * windows.forEach(win => {
 *   console.log(win.processId, win.title);
 * });
 */
export async function getActiveWindowProcessIds(): Promise<Window[]> {
   const cppProcess = spawn(getProcessListBinaryPath(), { detached: true, stdio: "pipe" });
   cppProcess.stdout.setEncoding("utf8");

   return new Promise<Window[]>((r) => {
      const processes: Window[] = [];
      let buffer = "";

      cppProcess.stdout.on("data", (d: string) => {
         buffer += d;
      });

      cppProcess.stdout.on("close", () => {
         const lines = buffer.split(/\r?\n/);
         for (const line of lines) {
            const parts = line.split(";");
            if (parts.length >= 3) {
               const processId = parts[0].trim();
               const hwnd = parts[1].trim();
               const title = parts[2].trim();
               if (processId && hwnd) {
                  processes.push({ processId, hwnd, title });
               }
            }
         }
         r(processes);
      });

      cppProcess.on("error", (err) => {
         console.error("[native-audio-loopback] ProcessList spawn error:", err);
         r([]);
      });
   });
}

const spawnedAudioCaptures: Map<string, ChildProcessWithoutNullStreams> = new Map();

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
export function startAudioCapture(processId: string, options: { onData?: (data: Uint8Array) => void; mode?: 'include' | 'exclude' }) {
   if (spawnedAudioCaptures.has(processId)) {
      throw new Error(`An audio capture with process id of ${processId} is already started`);
   }

   const args = [processId, options.mode || 'include'];
   const exePath = getLoopbackBinaryPath();
   console.log(`[native-audio-loopback] Spawning: ${exePath} with args:`, args);
   const cppProcess = spawn(exePath, args, {
      detached: true,
      stdio: "pipe",
   });

   spawnedAudioCaptures.set(processId, cppProcess);

   cppProcess.stdout.on("data", (d) => {
      options.onData?.(d);
   });

   return processId;
}

/**
 * Stops the audio capture process associated with the given process ID.
 * @param processId - The unique identifier of the audio capture process to stop.
 * @returns `true` if the process was found and stopped, otherwise `false`.
 */
export function stopAudioCapture(processId: string): boolean {
   const cppProcess = spawnedAudioCaptures.get(processId);

   if (cppProcess) {
      cppProcess.kill();
      spawnedAudioCaptures.delete(processId);
      return true;
   }

   return false;
}

/**
 * Convenience function to start capturing all system audio EXCEPT a specific process.
 */
export function captureSystemAudioExcluding(processIdToExclude: string, options: { onData: (data: Uint8Array) => void }) {
   return startAudioCapture(processIdToExclude, { onData: options.onData, mode: 'exclude' });
}

/**
 * Helper to find a process ID for a given window handle (HWND).
 * HWND can be passed as a number or a string.
 */
export async function getWindowPid(hwnd: string | number): Promise<string | null> {
   const targetHwnd = hwnd.toString().trim();
   const windows = await getActiveWindowProcessIds();

   console.log(`[native-audio-loopback] Searching for PID for HWND: "${targetHwnd}"`);

   const found = windows.find(w => w.hwnd === targetHwnd);
   if (found) {
      console.log(`[native-audio-loopback] ✓ Found PID: ${found.processId} for HWND: ${targetHwnd} (${found.title})`);
      return found.processId;
   } else {
      console.warn(`[native-audio-loopback] ✗ FAILED to find PID for HWND: "${targetHwnd}"`);
      // console.log("[native-audio-loopback] Available windows:", JSON.stringify(windows.slice(0, 10)));
      return null;
   }
}
