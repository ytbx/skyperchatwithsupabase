import { PERMISSIONS, ServerRole, ChannelPermission } from '@/lib/types';

export function hasPermission(userPermissions: bigint, permission: bigint): boolean {
    if ((userPermissions & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) {
        return true;
    }
    return (userPermissions & permission) === permission;
}

export function computeBasePermissions(memberRoles: ServerRole[], serverOwnerId: string, userId: string): bigint {
    if (userId === serverOwnerId) return PERMISSIONS.ADMINISTRATOR;

    let permissions = 0n;
    // Apply @everyone role permissions (usually position 0) first
    // Then apply other roles
    for (const role of memberRoles) {
        permissions |= BigInt(role.permissions);
    }

    return permissions;
}

export function computeChannelPermissions(
    basePermissions: bigint,
    memberRoles: ServerRole[],
    channelPermissions: ChannelPermission[],
    userId: string,
    serverOwnerId: string
): bigint {
    if (userId === serverOwnerId) return PERMISSIONS.ADMINISTRATOR;
    if ((basePermissions & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) return PERMISSIONS.ADMINISTRATOR;

    let permissions = basePermissions;

    // Apply @everyone overrides (role_id matches @everyone role ID - logic needed to identify it, usually lowest position)
    // For now, we'll assume we pass relevant overrides

    // Apply role overrides
    let allow = 0n;
    let deny = 0n;

    for (const role of memberRoles) {
        const override = channelPermissions.find(cp => cp.role_id === role.id);
        if (override) {
            allow |= BigInt(override.allow);
            deny |= BigInt(override.deny);
        }
    }

    permissions = (permissions & ~deny) | allow;

    // Apply member specific overrides
    const memberOverride = channelPermissions.find(cp => cp.user_id === userId);
    if (memberOverride) {
        permissions = (permissions & ~BigInt(memberOverride.deny)) | BigInt(memberOverride.allow);
    }

    return permissions;
}
