import { expect } from 'chai';

import { Mat4 } from '../../../src/core/math/mat4.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { NUM_BUCKETS } from '../../../src/scene/gsplat-unified/constants.js';
import { GSplatOctreeInstance } from '../../../src/scene/gsplat-unified/gsplat-octree-instance.js';

/**
 * Drive the real GSplatOctreeInstance.evaluateNodeLods against a minimal mock `this`, exercising the
 * fused budget-bucket seam the Alos screen-space reintegration introduced: the budgetBucket is now derived
 * from the screen-space-biased effectiveDistance (so LOD selection and budget priority share one metric),
 * and at bias <= 0 it is byte-identical to the stock distance bucket.
 *
 * Each node is a point-AABB placed in front of the camera (down -Z) at the given distance, so the
 * closest-point distance equals that distance and no behind-camera penalty applies.
 *
 * @param {object} cfg - Scenario config.
 * @returns {Array<{ optimalLod: number, worldDistance: number, budgetBucket: number }>} The mutated nodeInfos.
 */
function runEvaluateNodeLods(cfg) {
    const {
        nodeSpecs, ssRefRadius, bias, globalMaxForBuckets,
        uniformScale = 1, maxLod = 1, lodBaseDistance = 50, lodMultiplier = 2
    } = cfg;

    // Octree nodes: bounding-sphere radius (drives screen-space size) + per-LOD splat counts.
    const nodes = nodeSpecs.map(s => ({
        boundingSphere: { w: s.radius },
        lods: s.lods.map(count => ({ count }))
    }));

    // Packed [minX,minY,minZ,maxX,maxY,maxZ] per node — a degenerate point AABB at (0, 0, -distance).
    const nodeBoundsMinMax = new Float32Array(nodes.length * 6);
    nodeSpecs.forEach((s, i) => {
        const b = i * 6;
        nodeBoundsMinMax[b] = 0; nodeBoundsMinMax[b + 1] = 0; nodeBoundsMinMax[b + 2] = -s.distance;
        nodeBoundsMinMax[b + 3] = 0; nodeBoundsMinMax[b + 4] = 0; nodeBoundsMinMax[b + 5] = -s.distance;
    });

    const nodeInfos = nodes.map(() => ({ optimalLod: -1, worldDistance: 0, budgetBucket: -1 }));

    // Minimal mock standing in for a GSplatOctreeInstance. _ssRefRadius is preset (the median computation
    // is covered by gsplat-screen-space-lod.test.mjs); the world transform is identity so the explicit
    // uniformScale argument is the only scale applied.
    const inst = {
        octree: { nodes, nodeBoundsMinMax, _ssRefRadius: ssRefRadius },
        nodeInfos,
        placement: { node: { getWorldTransform: () => new Mat4() } },
        _lodMinDistThresholds: null,
        _ensureLodMinDistThresholds: GSplatOctreeInstance.prototype._ensureLodMinDistThresholds
    };

    const cameraNode = {
        camera: { fov: 60, horizontalFov: false, aspectRatio: 1 },
        getPosition: () => new Vec3(0, 0, 0),
        forward: new Vec3(0, 0, -1)
    };

    const params = { lodBehindPenalty: 1, screenSpaceLodBias: bias };

    GSplatOctreeInstance.prototype.evaluateNodeLods.call(
        inst, cameraNode, maxLod, lodBaseDistance, lodMultiplier, 0, maxLod, params, uniformScale, true, globalMaxForBuckets
    );

    return nodeInfos;
}

describe('GSplatOctreeInstance.evaluateNodeLods — fused screen-space budget bucket', function () {

    it('at bias 0, budgetBucket equals the stock sqrt(worldDistance) mapping', function () {
        const globalMaxForBuckets = 9000;
        const [info] = runEvaluateNodeLods({
            nodeSpecs: [{ radius: 5, distance: 3000, lods: [100, 10] }],
            ssRefRadius: 10, bias: 0, globalMaxForBuckets
        });

        // At bias 0 effectiveDistance === fovAdjustedDistance, so worldEffectiveDistance === nodeInfo.worldDistance
        // and the fused bucket must match stock's sqrt(worldDistance) * bucketScale, clamped.
        const bucketScale = NUM_BUCKETS / Math.sqrt(globalMaxForBuckets);
        const expected = Math.min(NUM_BUCKETS - 1, (Math.sqrt(info.worldDistance) * bucketScale) >>> 0);

        expect(info.budgetBucket).to.equal(expected);
    });

    it('at bias 0, two same-distance nodes get the SAME bucket regardless of radius', function () {
        const [big, small] = runEvaluateNodeLods({
            nodeSpecs: [
                { radius: 40, distance: 3000, lods: [100, 10] },
                { radius: 5, distance: 3000, lods: [100, 10] }
            ],
            ssRefRadius: 10, bias: 0, globalMaxForBuckets: 9000
        });

        expect(big.budgetBucket).to.equal(small.budgetBucket);
    });

    it('at bias 1, a larger-on-screen node gets a LOWER bucket (preserved under budget)', function () {
        // ssRefRadius 10 sits between the two radii: the radius-40 node is boosted (min(1, 10/40) = 0.25),
        // while the radius-5 node is left unchanged (min(1, 10/5) capped at 1). Same distance, so only the
        // screen-space size differentiates them.
        const [big, small] = runEvaluateNodeLods({
            nodeSpecs: [
                { radius: 40, distance: 3000, lods: [100, 10] },
                { radius: 5, distance: 3000, lods: [100, 10] }
            ],
            ssRefRadius: 10, bias: 1, globalMaxForBuckets: 9000
        });

        expect(big.budgetBucket).to.be.lessThan(small.budgetBucket);
    });
});
