import type { StalePageRecord } from './types.js';
export declare function getCurrentBranch(repoPath: string): string | null;
export declare function getDefaultBranch(repoPath: string): string | null;
export declare function isOnDefaultBranch(repoPath: string): boolean;
export declare function getHeadCommit(repoPath: string): string | null;
export declare function checkStaleness(repoPath: string): StalePageRecord[];
export declare function shouldNotify(repoPath: string): boolean;
export declare function markNotified(repoPath: string, commit: string): void;
