import { expect } from 'chai';

import { GSplatBudgetBalancer } from '../../../src/scene/gsplat-unified/gsplat-budget-balancer.js';

/**
 * Build a mock octreeInstances map (as GSplatWorld passes to balance()) from a list of node specs. Each spec:
 * { lods: number[] (splat count per LOD, finest first), optimalLod, budgetBucket, rangeMin, rangeMax }.
 *
 * budgetBucket is the value evaluateNodeLods fuses in: sqrt of the (screen-space-biased) effectiveDistance under
 * the shared global-max normalizer — bucket 0 = highest priority (nearest / largest-on-screen, degraded LAST),
 * bucket NUM_BUCKETS-1 = lowest priority (degraded FIRST). The balancer itself is bias-agnostic: it only reads
 * budgetBucket, so these tests pin the balancer's bucket mechanics independently of how the bucket was derived.
 * Fresh objects are created each call so a spec list can drive multiple independent balances.
 */
function makeInstances(specs) {
    const nodes = specs.map(s => ({ lods: s.lods.map(count => ({ count })) }));
    const nodeInfos = specs.map(s => ({
        optimalLod: s.optimalLod,
        budgetBucket: s.budgetBucket,
        lods: null,
        inst: { rangeMin: s.rangeMin, rangeMax: s.rangeMax }
    }));

    return new Map([[{}, { octree: { nodes }, nodeInfos }]]);
}

/** Read back the nodeInfos array after a balance. */
function infosOf(instances) {
    return [...instances.values()][0].nodeInfos;
}

describe('GSplatBudgetBalancer', function () {

    it('leaves LODs unchanged when already exactly at budget', function () {
        const instances = makeInstances([
            { lods: [100, 10], optimalLod: 0, budgetBucket: 0, rangeMin: 0, rangeMax: 1 }
        ]);
        new GSplatBudgetBalancer().balance(instances, 100);
        expect(infosOf(instances)[0].optimalLod).to.equal(0);
    });

    it('degrades the highest bucket (lowest priority) first, preserving bucket 0', function () {
        const instances = makeInstances([
            { lods: [100, 10], optimalLod: 0, budgetBucket: 0, rangeMin: 0, rangeMax: 1 },  // high priority
            { lods: [100, 10], optimalLod: 0, budgetBucket: 5, rangeMin: 0, rangeMax: 1 }   // low priority
        ]);
        // Start 200 splats, budget 110 => exactly one degrade (saves 90), taken from the highest bucket.
        new GSplatBudgetBalancer().balance(instances, 110);
        const [high, low] = infosOf(instances);
        expect(high.optimalLod).to.equal(0);
        expect(low.optimalLod).to.equal(1);
    });

    it('upgrades bucket 0 (highest priority) first when under budget', function () {
        const instances = makeInstances([
            { lods: [100, 10], optimalLod: 1, budgetBucket: 0, rangeMin: 0, rangeMax: 1 },  // high priority, coarse
            { lods: [100, 10], optimalLod: 1, budgetBucket: 5, rangeMin: 0, rangeMax: 1 }   // low priority, coarse
        ]);
        // Start 20 splats, budget 110 => one upgrade (adds 90) goes to bucket 0.
        new GSplatBudgetBalancer().balance(instances, 110);
        const [high, low] = infosOf(instances);
        expect(high.optimalLod).to.equal(0);
        expect(low.optimalLod).to.equal(1);
    });

    // Screen-space LOD relocation (Alos): the screen-space bias is no longer in the balancer — it is fused into
    // each node's budgetBucket by evaluateNodeLods via the biased effectiveDistance (a large-on-screen node gets
    // a smaller effective distance => a LOWER budgetBucket). This pins the consequence at the balancer seam:
    // given a large-but-distant node assigned a LOW bucket and a small node assigned a HIGH bucket, the small
    // node is degraded first — i.e. large-on-screen geometry is preserved under budget pressure.
    it('preserves a large-on-screen node (low fused bucket) over a small one (high fused bucket)', function () {
        const instances = makeInstances([
            { lods: [100, 10], optimalLod: 0, budgetBucket: 1, rangeMin: 0, rangeMax: 1 },  // large on screen -> low bucket
            { lods: [100, 10], optimalLod: 0, budgetBucket: 7, rangeMin: 0, rangeMax: 1 }   // small on screen -> high bucket
        ]);
        new GSplatBudgetBalancer().balance(instances, 110);
        const [large, small] = infosOf(instances);
        expect(large.optimalLod).to.equal(0);
        expect(small.optimalLod).to.equal(1);
    });
});
