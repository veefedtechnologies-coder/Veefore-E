const fs = require('fs');
const content = fs.readFileSync('client/src/AuthenticatedApp.tsx', 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(l => l.startsWith('const DashboardLayout = ({'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l === ')') + 1;

if (startIndex === -1 || endIndex === 0) {
  console.log('Could not find DashboardLayout');
  process.exit(1);
}

const dashboardLayoutLines = lines.slice(startIndex, endIndex);
const withoutDashboard = [...lines.slice(0, startIndex), ...lines.slice(endIndex)];

const insertIndex = withoutDashboard.findIndex(l => l.startsWith('export default function AuthenticatedApp() {'));

if (insertIndex === -1) {
  console.log('Could not find AuthenticatedApp');
  process.exit(1);
}

const finalLines = [
  ...withoutDashboard.slice(0, insertIndex),
  ...dashboardLayoutLines,
  '',
  ...withoutDashboard.slice(insertIndex)
];

fs.writeFileSync('client/src/AuthenticatedApp.tsx', finalLines.join('\n'));
console.log('Successfully moved DashboardLayout!');
