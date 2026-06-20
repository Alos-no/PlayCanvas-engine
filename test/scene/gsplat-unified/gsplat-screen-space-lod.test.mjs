import { expect } from 'chai';

import { medianNodeRadius, screenSpaceEffectiveDistance } from '../../../src/scene/gsplat-unified/gsplat-screen-space-lod.js';

describe('gsplat screen-space LOD helpers', function () {

    describe('#medianNodeRadius', function () {

        it('returns 1 for an empty list', function () {
            expect(medianNodeRadius([])).to.equal(1);
        });

        it('returns the single value for a one-element list', function () {
            expect(medianNodeRadius([5])).to.equal(5);
        });

        it('returns the middle value of a sorted odd-length list', function () {
            expect(medianNodeRadius([1, 2, 3, 4, 5])).to.equal(3);
        });

        it('sorts before taking the median (order-independent)', function () {
            expect(medianNodeRadius([5, 1, 3, 2, 4])).to.equal(3);
        });

        it('is robust to a cluster of large outliers (unlike the mean)', function () {
            // 7 small + 3 large: mean is 4.0, but the median ignores the large cluster.
            const radii = [1, 1, 1, 1, 1, 1, 1, 10, 10, 10];
            expect(medianNodeRadius(radii)).to.equal(1);
        });

        it('does not mutate the input array', function () {
            const input = [5, 1, 3];
            medianNodeRadius(input);
            expect(input).to.deep.equal([5, 1, 3]);
        });
    });

    describe('#screenSpaceEffectiveDistance', function () {

        it('returns the distance unchanged when bias is 0', function () {
            expect(screenSpaceEffectiveDistance(100, 90, 10, 0)).to.equal(100);
        });

        it('returns the distance unchanged when bias is negative', function () {
            expect(screenSpaceEffectiveDistance(100, 90, 10, -1)).to.equal(100);
        });

        it('returns the distance unchanged for a degenerate (~zero) radius', function () {
            expect(screenSpaceEffectiveDistance(100, 0, 10, 1)).to.equal(100);
        });

        it('leaves nodes at or below the reference size unchanged (min(1,...) cap)', function () {
            // radius 5 <= ref 10 => sizeRatio capped at 1 => distance unchanged.
            expect(screenSpaceEffectiveDistance(100, 5, 10, 1)).to.equal(100);
            // radius exactly the reference => sizeRatio 1 => unchanged, even at higher bias.
            expect(screenSpaceEffectiveDistance(100, 10, 10, 2)).to.equal(100);
        });

        it('shrinks the effective distance for nodes larger than the reference (bias 1)', function () {
            // sizeRatio = 10/90 = 0.1111..., distance * ratio^1.
            expect(screenSpaceEffectiveDistance(100, 90, 10, 1)).to.be.closeTo(11.1111, 1e-3);
        });

        it('applies the bias as an exponent on the size ratio (bias 2)', function () {
            // (10/90)^2 = 0.012345..., distance * that.
            expect(screenSpaceEffectiveDistance(100, 90, 10, 2)).to.be.closeTo(1.23457, 1e-3);
        });

        it('is monotonic: higher bias => smaller effective distance for a large node', function () {
            const unbiased = screenSpaceEffectiveDistance(100, 90, 10, 0);
            const bias1 = screenSpaceEffectiveDistance(100, 90, 10, 1);
            const bias2 = screenSpaceEffectiveDistance(100, 90, 10, 2);
            expect(bias1).to.be.lessThan(unbiased);
            expect(bias2).to.be.lessThan(bias1);
        });
    });
});
