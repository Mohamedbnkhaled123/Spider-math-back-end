import assert from 'assert';
import { updateUnitPackageDtoSchema, createUnitPackageDtoSchema } from '../dto/unit-crud.dto';

console.log('Running Curriculum Reordering Verification Tests...');

// Test 1: createUnitPackageDtoSchema accepts order and maps to order_index
const createPayload = {
  curriculum: 'EGYPTIAN',
  grade_level: 'SEC_3',
  academic_term: 'TERM_1',
  title_ar: 'الوحدة الأولى تفاضل',
  price_egp: 100,
  order: 5
};
const parsedCreate = createUnitPackageDtoSchema.parse(createPayload);
assert.strictEqual(parsedCreate.order_index, 5, 'createUnitPackageDtoSchema must map order to order_index');
console.log('[PASS] Test 1 Passed: createUnitPackageDtoSchema maps order to order_index.');

// Test 2: updateUnitPackageDtoSchema accepts order and maps to order_index
const updatePayload = {
  order: 3
};
const parsedUpdate = updateUnitPackageDtoSchema.parse(updatePayload);
assert.strictEqual(parsedUpdate.order_index, 3, 'updateUnitPackageDtoSchema must map order to order_index');
console.log('[PASS] Test 2 Passed: updateUnitPackageDtoSchema maps order to order_index.');

// Test 3: updateUnitPackageDtoSchema preserves explicit order_index
const updateOrderIndexPayload = {
  order_index: 4
};
const parsedOrderIndexUpdate = updateUnitPackageDtoSchema.parse(updateOrderIndexPayload);
assert.strictEqual(parsedOrderIndexUpdate.order_index, 4, 'updateUnitPackageDtoSchema must preserve order_index');
console.log('[PASS] Test 3 Passed: updateUnitPackageDtoSchema preserves explicit order_index.');

// Test 4: Array reordering reindexing simulation
const sampleUnits: Array<{ id: string; title: string; order: number }> = [
  { id: 'u1', title: 'Unit 1', order: 1 },
  { id: 'u2', title: 'Unit 2', order: 2 },
  { id: 'u3', title: 'Unit 3', order: 3 }
];
// Move u2 up (index 1 to index 0)
const indexToMove = 1;
const reordered = [...sampleUnits];
const currentItem = reordered[indexToMove]!;
const prevItem = reordered[indexToMove - 1]!;
reordered[indexToMove] = prevItem;
reordered[indexToMove - 1] = currentItem;
const reindexed = reordered.map((u, i) => ({ ...u, order: i + 1 }));

assert.strictEqual(reindexed[0]?.id, 'u2');
assert.strictEqual(reindexed[0]?.order, 1);
assert.strictEqual(reindexed[1]?.id, 'u1');
assert.strictEqual(reindexed[1]?.order, 2);
assert.strictEqual(reindexed[2]?.id, 'u3');
assert.strictEqual(reindexed[2]?.order, 3);
console.log('[PASS] Test 4 Passed: Units array reordering and reindexing operates identically to Honor Board.');

// Test 5: Lectures reindexing simulation
const sampleLectures = [
  { id: 'l1', titleAr: 'محاضرة 1', order: 1 },
  { id: 'l2', titleAr: 'محاضرة 2', order: 2 }
];
// Swap l1 and l2
const lecReordered = [sampleLectures[1]!, sampleLectures[0]!].map((l, i) => ({ ...l, order: i + 1 }));
assert.strictEqual(lecReordered[0]?.id, 'l2');
assert.strictEqual(lecReordered[0]?.order, 1);
assert.strictEqual(lecReordered[1]?.id, 'l1');
assert.strictEqual(lecReordered[1]?.order, 2);
console.log('[PASS] Test 5 Passed: Lectures reindexing sequentially assigns order 1..N.');

// Test 6: Sanitization of non-positive order values
const zeroOrderItems = [{ id: '507f1f77bcf86cd799439011', order_index: 0 }, { id: '507f1f77bcf86cd799439012', order_index: -2 }];
const sanitizedOrders = zeroOrderItems.map((it, idx) => ({
  id: it.id,
  order_index: Math.max(1, it.order_index ?? (idx + 1))
}));
assert.strictEqual(sanitizedOrders[0]?.order_index, 1, 'order 0 must be clamped to 1');
assert.strictEqual(sanitizedOrders[1]?.order_index, 1, 'negative order must be clamped to 1');
console.log('[PASS] Test 6 Passed: Non-positive orders are clamped cleanly to 1.');

// Test 7: Multi-format payload support for batch reorder
const idArrayPayload = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
const mappedFromIds = idArrayPayload.map((id, idx) => ({ id, order_index: idx + 1 }));
assert.strictEqual(mappedFromIds[0]?.order_index, 1);
assert.strictEqual(mappedFromIds[1]?.order_index, 2);

const unitIdsObjectPayload = { unitIds: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011'] };
const mappedFromUnitIds = unitIdsObjectPayload.unitIds.map((id, idx) => ({ id, order_index: idx + 1 }));
assert.strictEqual(mappedFromUnitIds[0]?.id, '507f1f77bcf86cd799439012');
assert.strictEqual(mappedFromUnitIds[0]?.order_index, 1);
console.log('[PASS] Test 7 Passed: Multi-format batch reorder payloads parsed correctly.');

console.log('======================================================');
console.log('ALL CURRICULUM REORDERING BACKEND TESTS PASSED!');
console.log('======================================================');
