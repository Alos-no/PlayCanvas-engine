/**
 * ALOS screen-space LOD helpers.
 *
 * These bias a GSplat octree node's optimal LOD by its on-screen size, so that large-but-distant
 * geometry (e.g. background hills) keeps detail that pure camera-distance LOD would starve. They
 * are pure functions so the behavior can be unit-tested in isolation (see
 * gsplat-screen-space-lod.test.mjs); the octree instance and budget balancer consume them.
 *
 * @ignore
 */

/**
 * Median of a list of node bounding-sphere radii, used as the "typical node size" reference for
 * screen-space biasing. The median (rather than the mean) is used because a cluster of large far
 * cells skews the mean upward and weakens the bias. Does not mutate the input array.
 *
 * @param {number[]} radii - Node bounding-sphere radii.
 * @returns {number} The median radius, or 1 for an empty list.
 */
function medianNodeRadius(radii) {
    if (!radii.length) {
        return 1;
    }

    const sorted = radii.slice().sort((a, b) => a - b);

    return sorted[sorted.length >> 1];
}

/**
 * Bias a node's effective LOD distance by its on-screen size. A node larger than the reference is
 * treated as closer (so it gets a finer LOD); the `min(1, ...)` cap means nodes at or below the
 * reference size (small near cells) are left unchanged. A bias of 0 or below — or a degenerate
 * radius — returns the distance unchanged (pure distance behavior).
 *
 * @param {number} fovAdjustedDistance - FOV-compensated camera distance to the node.
 * @param {number} nodeRadius - The node's bounding-sphere radius (same space as refRadius).
 * @param {number} refRadius - Reference ("typical") node radius (see {@link medianNodeRadius}).
 * @param {number} bias - Screen-space bias strength; 0 (or less) disables it.
 * @returns {number} The size-biased effective distance.
 */
function screenSpaceEffectiveDistance(fovAdjustedDistance, nodeRadius, refRadius, bias) {
    if (bias <= 0 || nodeRadius <= 1e-6) {
        return fovAdjustedDistance;
    }

    const sizeRatio = Math.min(1, refRadius / nodeRadius);

    return fovAdjustedDistance * Math.pow(sizeRatio, bias);
}

export { medianNodeRadius, screenSpaceEffectiveDistance };
