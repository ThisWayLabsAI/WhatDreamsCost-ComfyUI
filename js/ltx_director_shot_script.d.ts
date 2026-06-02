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

export interface ParsedShotScriptDocument {
  globalPrompt: string;
  video: ParsedVideoMetadata;
  shots: ParsedShot[];
}

export interface ShotScriptParseIssue {
  line: number;
  message: string;
  declaration?: string;
}

export class ShotScriptParseError extends Error {
  errors: ShotScriptParseIssue[];
  constructor(errors: ShotScriptParseIssue[]);
}

export function parseShotScript(text: string): ParsedShot[];
export function parseShotScriptDocument(text: string): ParsedShotScriptDocument;
export function formatShotScriptParseErrors(errors: ShotScriptParseIssue[]): string;
export function formatShotScript(input: { globalPrompt?: string; video?: ParsedVideoMetadata; shots: ParsedShot[] }): string;
export function exportTimelineToShotScript(input: {
  segments?: Array<{ start: number; length: number; prompt?: string }>;
  globalPrompt?: string;
  frameRate?: number;
  video?: ParsedVideoMetadata;
}): string;
