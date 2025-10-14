import assert from "node:assert/strict";
import test from "node:test";

import { aggregateToGrid, gridIdForPoint, haversineDistanceMeters } from "../src/utils/geo.js";

test("haversineDistanceMeters returns ~0 for identical points", () => {
  const distance = haversineDistanceMeters({ lng: 121.4737, lat: 31.2304 }, { lng: 121.4737, lat: 31.2304 });
  assert.ok(distance < 1);
});

test("gridIdForPoint buckets close points together", () => {
  const base = { lng: 121.4737, lat: 31.2304 };
  const grid1 = gridIdForPoint(base, 500);
  const grid2 = gridIdForPoint({ lng: 121.474, lat: 31.2306 }, 500);
  assert.equal(grid1, grid2);
});

test("aggregateToGrid counts points per cell", () => {
  const cells = aggregateToGrid(
    [
      { lng: 121.47, lat: 31.23 },
      { lng: 121.4701, lat: 31.2301 },
      { lng: 121.485, lat: 31.235 },
    ],
    500
  );

  assert.equal(cells.length, 2);
  assert.equal(cells[0].count, 2);
  assert.equal(cells[1].count, 1);
});
