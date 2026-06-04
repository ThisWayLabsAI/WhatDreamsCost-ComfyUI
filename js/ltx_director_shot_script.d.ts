export interface ParsedShot {
  shotNumber: number;
  duration: number;
  prompt: string;
}

export interface ParsedVideoMetadata {
  width?: number;
  height?: number;
  totalDuration?: number;
}

export interface ParsedShotList {
  globalPrompt: string;
  video: ParsedVideoMetadata;
  shots: ParsedShot[];
  warnings: string[];
}

export interface ShotListParseIssue {
  line: number;
  message: string;
  declaration?: string;
}

export class ShotListParseError extends Error {
  errors: ShotListParseIssue[];
  constructor(errors: ShotListParseIssue[]);
}

export function parseShotList(text: string): ParsedShotList;
export function formatShotListParseErrors(errors: ShotListParseIssue[]): string;
export function formatShotList(input: { globalPrompt?: string; video?: ParsedVideoMetadata; shots: ParsedShot[] }): string;
export function exportTimelineToShotList(input: {
  segments?: Array<{ start: number; length: number; prompt?: string }>;
  globalPrompt?: string;
  frameRate?: number;
  video?: ParsedVideoMetadata;
}): string;
export function exportShotList(input: {
  segments?: Array<{ start: number; length: number; prompt?: string }>;
  globalPrompt?: string;
  frameRate?: number;
  video?: ParsedVideoMetadata;
}): string;

// Legacy aliases
export class ShotScriptParseError extends ShotListParseError {}
export function parseShotScript(text: string): ParsedShot[];
export function parseShotScriptDocument(text: string): ParsedShotList;
export function formatShotScriptParseErrors(errors: ShotListParseIssue[]): string;
export function formatShotScript(input: { globalPrompt?: string; video?: ParsedVideoMetadata; shots: ParsedShot[] }): string;
export function exportTimelineToShotScript(input: {
  segments?: Array<{ start: number; length: number; prompt?: string }>;
  globalPrompt?: string;
  frameRate?: number;
  video?: ParsedVideoMetadata;
}): string;
