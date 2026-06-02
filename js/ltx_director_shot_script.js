/**
 * @typedef {Object} ParsedShot
 * @property {number} shotNumber
 * @property {number} duration
 * @property {string} prompt
 */

/**
 * @typedef {Object} ShotScriptParseIssue
 * @property {number} line
 * @property {string} message
 * @property {string} [declaration]
 */

/**
 * @typedef {Object} ParsedShotScriptDocument
 * @property {string} globalPrompt
 * @property {ParsedShot[]} shots
 */

const GLOBAL_HEADER_REGEX = /^\s*GLOBAL:\s*$/i;
const SHOT_LINE_REGEX = /^\s*SHOT\b/i;
const SHOT_HEADER_REGEX = /^\s*SHOT\s+(\d+)\s*\|\s*(.*?)\s*$/i;
const DURATION_REGEX = /^(\d+(?:\.\d+)?)\s*s?$/i;

class ShotScriptParseError extends Error {
  /**
   * @param {ShotScriptParseIssue[]} errors
   */
  constructor(errors) {
    super(formatShotScriptParseErrors(errors));
    this.name = "ShotScriptParseError";
    this.errors = errors;
  }
}

/**
 * @param {string} text
 * @returns {ParsedShot[]}
 */
function parseShotScript(text) {
  return parseShotScriptDocument(text).shots;
}

/**
 * @param {string} text
 * @returns {ParsedShotScriptDocument}
 */
function parseShotScriptDocument(text) {
  const normalized = normalizeLineEndings(text);
  const lines = normalized.split("\n");
  const errors = [];
  const headers = [];

  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  let globalPrompt = "";

  if (firstContentLine !== -1 && GLOBAL_HEADER_REGEX.test(lines[firstContentLine])) {
    let globalEnd = lines.length;
    for (let i = firstContentLine + 1; i < lines.length; i++) {
      if (SHOT_LINE_REGEX.test(lines[i])) {
        globalEnd = i;
        break;
      }
    }
    globalPrompt = lines.slice(firstContentLine + 1, globalEnd).join("\n");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SHOT_LINE_REGEX.test(line)) continue;

    const headerMatch = line.match(SHOT_HEADER_REGEX);
    if (!headerMatch) {
      errors.push({
        line: i + 1,
        message: "Invalid shot declaration:",
        declaration: line,
      });
      continue;
    }

    const shotNumber = parseInt(headerMatch[1], 10);
    const rawDuration = headerMatch[2].trim();

    if (!rawDuration) {
      errors.push({
        line: i + 1,
        message: "Missing duration:",
        declaration: line,
      });
      continue;
    }

    const durationMatch = rawDuration.match(DURATION_REGEX);
    const duration = durationMatch ? parseFloat(durationMatch[1]) : NaN;
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push({
        line: i + 1,
        message: "Invalid shot declaration:",
        declaration: line,
      });
      continue;
    }

    headers.push({
      line: i + 1,
      lineIndex: i,
      shotNumber,
      duration,
    });
  }

  if (headers.length === 0) {
    errors.push({
      line: 1,
      message: "No SHOT blocks found.",
    });
  }

  const seenShotNumbers = new Map();
  for (const header of headers) {
    if (seenShotNumbers.has(header.shotNumber)) {
      errors.push({
        line: header.line,
        message: `Duplicate shot number: ${header.shotNumber}`,
      });
      continue;
    }
    seenShotNumbers.set(header.shotNumber, header.line);
  }

  if (errors.length > 0) {
    throw new ShotScriptParseError(errors);
  }

  const shots = headers.map((header, index) => {
    const nextHeader = headers[index + 1];
    const promptLines = lines.slice(header.lineIndex + 1, nextHeader ? nextHeader.lineIndex : lines.length);
    return {
      shotNumber: header.shotNumber,
      duration: header.duration,
      prompt: promptLines.join("\n"),
    };
  });

  return { globalPrompt, shots };
}

/**
 * @param {ShotScriptParseIssue[]} errors
 * @returns {string}
 */
function formatShotScriptParseErrors(errors) {
  return errors.map((error) => {
    if (error.declaration) {
      return `Line ${error.line}:\n${error.message}\n${error.declaration}`;
    }
    return `Line ${error.line}:\n${error.message}`;
  }).join("\n\n");
}

/**
 * @param {{ globalPrompt?: string, shots: ParsedShot[] }} input
 * @returns {string}
 */
function formatShotScript(input) {
  const sections = [];
  const globalPrompt = input.globalPrompt ?? "";
  if (globalPrompt) {
    sections.push(`GLOBAL:\n${globalPrompt}`);
  }

  for (const shot of input.shots) {
    sections.push(`SHOT ${shot.shotNumber} | ${formatDurationSeconds(shot.duration)}s\n${shot.prompt ?? ""}`);
  }

  return sections.join("\n\n");
}

/**
 * @param {{ segments?: Array<{ start: number, length: number, prompt?: string }>, globalPrompt?: string, frameRate?: number }} input
 * @returns {string}
 */
function exportTimelineToShotScript(input) {
  const frameRate = Number.isFinite(input.frameRate) && input.frameRate > 0 ? input.frameRate : 24;
  const segments = [...(input.segments || [])].sort((a, b) => a.start - b.start);
  const shots = segments.map((segment, index) => ({
    shotNumber: index + 1,
    duration: segment.length / frameRate,
    prompt: segment.prompt || "",
  }));
  return formatShotScript({
    globalPrompt: input.globalPrompt || "",
    shots,
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeLineEndings(text) {
  return (text || "").replace(/\r\n?/g, "\n");
}

/**
 * @param {number} duration
 * @returns {string}
 */
function formatDurationSeconds(duration) {
  const rounded = Number(duration.toFixed(3));
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

const shotScriptApi = {
  ShotScriptParseError,
  exportTimelineToShotScript,
  formatShotScript,
  formatShotScriptParseErrors,
  parseShotScript,
  parseShotScriptDocument,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = shotScriptApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.LTXDirectorShotScript = shotScriptApi;
}
