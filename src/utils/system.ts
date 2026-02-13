import os from 'os';

export function getSystemContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: true 
  });
  
  return `
System Context:
- Current Date: ${dateStr}
- Current Time: ${timeStr}
- Operating System: ${process.platform} (${os.release()})
- Project: Sybil (Autonomous AI Agent)
- Workspace: ${process.cwd()}
`;
}
