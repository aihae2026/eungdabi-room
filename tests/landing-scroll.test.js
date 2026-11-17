const test = require('node:test');
const assert = require('node:assert/strict');
const Gate = require('../assets/landing/scroll-gate.js');

test('a large wheel delta advances one stage, never several', () => {
  const gate = new Gate();
  assert.equal(gate.sample(9000, 0), 1);
  assert.equal(gate.sample(9000, 40), 0);
});
test('continuous trackpad inertia stays consumed after the animation cooldown', () => {
  const gate = new Gate();
  const moves = [];
  for (let t = 0; t <= 2400; t += 80) moves.push(gate.sample(120 - t / 25, t));
  assert.equal(moves.filter(Boolean).length, 1);
  assert.equal(gate.sample(90, 2800), 1);
});
test('a new deliberate gesture after the quiet interval advances once', () => {
  const gate = new Gate();
  assert.equal(gate.sample(120, 0), 1);
  assert.equal(gate.sample(120, 1000), 1);
  assert.equal(gate.sample(120, 1050), 0);
});
test('a fresh deliberate burst responds without the old 850ms dead time', () => {
  const gate = new Gate();
  assert.equal(gate.sample(120, 0), 1);
  assert.equal(gate.sample(120, 320), 1);
  assert.equal(gate.sample(80, 350), 0);
});
test('reading to the bottom does not also change the scene in that gesture', () => {
  const gate = new Gate();
  assert.equal(gate.sample(100, 0, { nativeScroll: true }), 0);
  assert.equal(gate.sample(100, 100), 0);
  assert.equal(gate.sample(100, 900), 1);
});
test('a second gesture after 110ms responds without waiting a full second', () => {
  const gate = new Gate();
  assert.equal(gate.sample(100, 0), 1);
  assert.equal(gate.sample(60, 40), 0);
  assert.equal(gate.sample(100, 150), 1);
  assert.equal(gate.sample(60, 190), 0);
});
test('deliberate direction reversal responds immediately', () => {
  const gate = new Gate();
  assert.equal(gate.sample(100, 0), 1);
  assert.equal(gate.sample(-100, 120), -1);
  assert.equal(gate.sample(-60, 160), 0);
});
test('minor opposite-direction bounce does not undo a stage', () => {
  const gate = new Gate();
  assert.equal(gate.sample(100, 0), 1);
  assert.equal(gate.sample(-3, 60), 0);
  assert.equal(gate.sample(-4, 80), 0);
  assert.equal(gate.sample(20, 100), 0);
});
test('stage inertia cannot scroll content in the newly entered page', () => {
  const gate = new Gate();
  assert.equal(gate.sample(100, 0), 1);
  assert.equal(gate.sample(80, 80, { nativeScroll: true }), 0);
  assert.equal(gate.allowNativeScroll, false);
  assert.equal(gate.sample(80, 400, { nativeScroll: true }), 0);
  assert.equal(gate.allowNativeScroll, true);
});
test('minor motion is accumulated, but canceled directions are not added together', () => {
  const gate = new Gate();
  assert.equal(gate.sample(20, 0), 0);
  assert.equal(gate.sample(-20, 30), 0);
  assert.equal(gate.sample(-15, 60), -1);
});
test('button and dialog actions absorb residual wheel input', () => {
  const gate = new Gate();
  gate.sample(100, 0);
  gate.block(40);
  assert.equal(gate.sample(500, 80), 0);
  assert.equal(gate.sample(500, 550), 1);
});
test('a button click does not invent a wheel gesture and swallow the next scroll', () => {
  const gate = new Gate();
  gate.block(100);
  assert.equal(gate.sample(100, 120), 1);
});
test('pixel, line and page wheel units are normalized', () => {
  assert.equal(Gate.normalize(3, 0, 700), 3);
  assert.equal(Gate.normalize(3, 1, 700), 48);
  assert.equal(Gate.normalize(1, 2, 700), 700);
});
test('non-finite and zero samples do not change the gate', () => {
  const gate = new Gate();
  assert.equal(gate.sample(NaN, 0), 0);
  assert.equal(gate.sample(Infinity, 0), 0);
  assert.equal(gate.sample(0, 0), 0);
  assert.equal(gate.sample(100, 0), 1);
});

test('sparse decaying inertia stays consumed but a renewed stroke responds', () => {
  const gate = new Gate();
  assert.equal(gate.sample(120, 0), 1);
  for (let i = 1; i <= 12; i++) assert.equal(gate.sample(80 - i * 3, i * 120), 0);
  assert.equal(gate.sample(100, 1560), 1);
  assert.equal(gate.sample(40, 1900), 1);
});
