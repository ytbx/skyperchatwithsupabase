/**
 * Media Permission Handler - Robust media access with permission recovery
 */

export type MediaPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface MediaPermissionState {
  audio: MediaPermissionStatus;
  video: MediaPermissionStatus;
  screen: MediaPermissionStatus;
}

export class MediaPermissionHandler {
  private static permissionState: MediaPermissionState = {
    audio: 'unknown',
    video: 'unknown',
    screen: 'unknown',
  };

  /**
   * Request media with comprehensive error handling
   */
  static async requestMedia(
    constraints: MediaStreamConstraints
  ): Promise<{ stream: MediaStream | null; error: string | null }> {
    try {
      console.log('[MediaPermission] Requesting media:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Update permission state
      if (constraints.audio) {
        MediaPermissionHandler.permissionState.audio = 'granted';
      }
      if (constraints.video) {
        MediaPermissionHandler.permissionState.video = 'granted';
      }
      
      console.log('[MediaPermission] Media access granted');
      return { stream, error: null };
      
    } catch (error) {
      console.error('[MediaPermission] Media access failed:', error);
      
      if (error instanceof Error) {
        // Handle specific error types
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          if (constraints.audio) {
            MediaPermissionHandler.permissionState.audio = 'denied';
          }
          if (constraints.video) {
            MediaPermissionHandler.permissionState.video = 'denied';
          }
          return { 
            stream: null, 
            error: 'Medya erişim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.' 
          };
        }
        
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          return { 
            stream: null, 
            error: 'Mikrofon veya kamera bulunamadı. Lütfen cihazınızı kontrol edin.' 
          };
        }
        
        if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          return { 
            stream: null, 
            error: 'Medya cihazı başka bir uygulama tarafından kullanılıyor.' 
          };
        }
        
        if (error.name === 'OverconstrainedError') {
          return { 
            stream: null, 
            error: 'İstenen medya ayarları desteklenmiyor.' 
          };
        }
        
        if (error.name === 'TypeError') {
          return { 
            stream: null, 
            error: 'Geçersiz medya kısıtlamaları.' 
          };
        }
      }
      
      return { 
        stream: null, 
        error: 'Medya erişimi başarısız oldu. Lütfen tekrar deneyin.' 
      };
    }
  }

  /**
   * Request display media (screen share) with error handling
   */
  static async requestDisplayMedia(): Promise<{ stream: MediaStream | null; error: string | null }> {
    try {
      console.log('[MediaPermission] Requesting display media');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      
      MediaPermissionHandler.permissionState.screen = 'granted';
      console.log('[MediaPermission] Display media access granted');
      
      return { stream, error: null };
      
    } catch (error) {
      console.error('[MediaPermission] Display media access failed:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          MediaPermissionHandler.permissionState.screen = 'denied';
          return { 
            stream: null, 
            error: 'Ekran paylaşım izni reddedildi.' 
          };
        }
        
        if (error.name === 'AbortError') {
          return { 
            stream: null, 
            error: 'Ekran paylaşımı iptal edildi.' 
          };
        }
      }
      
      return { 
        stream: null, 
        error: 'Ekran paylaşımı başarısız oldu.' 
      };
    }
  }

  /**
   * Check current permission status
   */
  static async checkPermissions(): Promise<MediaPermissionState> {
    try {
      // Check audio permission
      if (navigator.permissions) {
        try {
          const audioPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          MediaPermissionHandler.permissionState.audio = audioPermission.state as MediaPermissionStatus;
        } catch {
          // Permission API might not support microphone
        }
        
        try {
          const videoPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          MediaPermissionHandler.permissionState.video = videoPermission.state as MediaPermissionStatus;
        } catch {
          // Permission API might not support camera
        }
      }
    } catch (error) {
      console.warn('[MediaPermission] Permission check failed:', error);
    }
    
    return MediaPermissionHandler.permissionState;
  }

  /**
   * Get current permission state
   */
  static getPermissionState(): MediaPermissionState {
    return { ...MediaPermissionHandler.permissionState };
  }

  /**
   * Check if media devices are available
   */
  static async hasMediaDevices(): Promise<{ audio: boolean; video: boolean }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audio: devices.some(device => device.kind === 'audioinput'),
        video: devices.some(device => device.kind === 'videoinput'),
      };
    } catch (error) {
      console.error('[MediaPermission] Failed to enumerate devices:', error);
      return { audio: false, video: false };
    }
  }

  /**
   * Reset permission state
   */
  static resetPermissionState(): void {
    MediaPermissionHandler.permissionState = {
      audio: 'unknown',
      video: 'unknown',
      screen: 'unknown',
    };
    console.log('[MediaPermission] Permission state reset');
  }
}
