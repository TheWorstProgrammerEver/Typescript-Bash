import type { ChildProcess } from 'node:child_process';

const terminationGraceMs = 100;
const terminationPollMs = 5;

const isMissingProcess = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ESRCH';

const processGroupExists = (child: ChildProcess): boolean => {
  if (child.pid === undefined) return false;
  if (process.platform === 'win32') {
    return child.exitCode === null && child.signalCode === null;
  }

  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcess(error)) return false;
    return true;
  }
};

const signalProcessGroup = (child: ChildProcess, signal: NodeJS.Signals): void => {
  if (child.pid === undefined) return;

  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (isMissingProcess(error)) child.kill(signal);
  }
};

const waitForProcessGroupExit = async (child: ChildProcess, waitMs: number): Promise<boolean> => {
  const deadline = Date.now() + waitMs;

  while (processGroupExists(child)) {
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, terminationPollMs));
  }

  return true;
};

export const terminateProcessGroup = async (child: ChildProcess): Promise<void> => {
  if (!processGroupExists(child)) return;

  signalProcessGroup(child, 'SIGTERM');
  if (await waitForProcessGroupExit(child, terminationGraceMs)) return;

  signalProcessGroup(child, 'SIGKILL');
  await waitForProcessGroupExit(child, terminationGraceMs);
};

export const hasRunningProcessGroup = processGroupExists;
