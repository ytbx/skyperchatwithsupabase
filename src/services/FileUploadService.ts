import { supabase } from '@/lib/supabase';

const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface UploadResult {
    url: string;
    name: string;
    size: number;
    type: string;
}

export class FileUploadService {
    /**
     * Validate file size and type
     */
    static validateFile(file: File, maxSizeMB: number = MAX_FILE_SIZE_MB): { valid: boolean; error?: string } {
        if (file.size > maxSizeMB * 1024 * 1024) {
            return {
                valid: false,
                error: `Dosya boyutu ${maxSizeMB}MB'dan küçük olmalıdır. Seçilen dosya: ${(file.size / 1024 / 1024).toFixed(2)}MB`
            };
        }

        return { valid: true };
    }

    /**
     * Upload user avatar to Supabase Storage
     */
    static async uploadAvatar(userId: string, file: File): Promise<string> {
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Upload new avatar with upsert
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/avatar.${fileExt}`; // Simplified name for easier upsert

        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(data.path);

        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ profile_image_url: publicUrl })
            .eq('id', userId);

        if (updateError) throw updateError;

        return publicUrl;
    }

    /**
     * Upload server image to Supabase Storage
     */
    static async uploadServerImage(serverId: string, file: File): Promise<string> {
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Upload new server image with upsert
        const fileExt = file.name.split('.').pop();
        const fileName = `${serverId}/icon.${fileExt}`; // Simplified name for easier upsert

        const { data, error } = await supabase.storage
            .from('server-images')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('server-images')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    /**
     * Upload message attachment to Supabase Storage
     */
    static async uploadMessageAttachment(file: File): Promise<UploadResult> {
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileName = `${timestamp}-${randomStr}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from('message-attachments')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(data.path);

        return {
            url: publicUrl,
            name: file.name,
            size: file.size,
            type: file.type
        };
    }

    /**
     * Delete file from Supabase Storage
     */
    static async deleteFile(bucket: string, path: string): Promise<void> {
        const { error } = await supabase.storage
            .from(bucket)
            .remove([path]);

        if (error) throw error;
    }

    /**
     * Check if file is an image
     */
    static isImage(file: File): boolean {
        return file.type.startsWith('image/');
    }

    /**
     * Format file size for display
     */
    static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }
}
