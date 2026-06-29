import fs from 'fs';
const file = 'client/src/pages/__tests__/AnimatedDashboard.keyboard.simple.client.test.tsx';
let content = fs.readFileSync(file, 'utf8');

const mockCode = `
// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
`;

if (!content.includes('matchMedia')) {
  content = content.replace("class MockResizeObserver {", mockCode + "\nclass MockResizeObserver {");
  fs.writeFileSync(file, content);
}
