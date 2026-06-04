// @ts-check

/**
 * @typedef {Object} ParsedShot
 * @property {number} shotNumber
 * @property {number} duration
 * @property {string} prompt
 */

/**
 * @typedef {Object} ShotListParseIssue
 * @property {number} line
 * @property {string} message
 * @property {string} [declaration]
 */

/**
 * @typedef {Object} ParsedVideoMetadata
 * @property {number | undefined} width
 * @property {number | undefined} height
 * @property {number | undefined} totalDuration
 */

/**
 * @typedef {Object} ParsedShotList
 * @property {string} globalPrompt
 * @property {ParsedVideoMetadata} video
 * @property {ParsedShot[]} shots
 * @property {string[]} warnings
 */

const GLOBAL_HEADER_REGEX = /^\s*GLOBAL:\s*(.*)$/i;
const VIDEO_HEADER_REGEX = /^\s*VIDEO:\s*$/i;
const VIDEO_PROPERTY_REGEX = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i;
const SHOT_LINE_REGEX = /^\s*(?:CLIP|SHOT)\b/i;
const SHOT_HEADER_REGEX = /^\s*(?:CLIP|SHOT)\s+(\d+)\s*\|\s*(.*?)\s*$/i;
const DURATION_REGEX = /^(\d+(?:\.\d+)?)\s*s?$/i;

/**
 * @param {string} value
 * @returns {string}
 */
function trimEdgeBlankLines(value) {
  return value
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

class ShotListParseError extends Error {
  /**
   * @param {ShotListParseIssue[]} errors
   */
  constructor(errors) {
    super(formatShotListParseErrors(errors));
    this.name = "ShotListParseError";
    this.errors = errors;
  }
}

/**
 * @param {string} text
 * @returns {ParsedShotList}
 */
function parseShotList(text) {
  const normalized = normalizeLineEndings(text);
  const lines = normalized.split("\n");
  /** @type {ShotListParseIssue[]} */
  const errors = [];
  const headers = [];

  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  let globalPrompt = "";
  /** @type {ParsedVideoMetadata} */
  const video = { width: undefined, height: undefined, totalDuration: undefined };
  const firstShotLine = lines.findIndex((line) => SHOT_LINE_REGEX.test(line));
  const preShotEnd = firstShotLine === -1 ? lines.length : firstShotLine;
  let postGlobalLine = firstContentLine;

  if (firstContentLine !== -1 && GLOBAL_HEADER_REGEX.test(lines[firstContentLine])) {
    const globalHeaderMatch = lines[firstContentLine].match(GLOBAL_HEADER_REGEX);
    const inlineGlobalPrompt = globalHeaderMatch ? globalHeaderMatch[1] : "";
    let globalEnd = preShotEnd;
    for (let i = firstContentLine + 1; i < lines.length; i++) {
      if (SHOT_LINE_REGEX.test(lines[i]) || VIDEO_HEADER_REGEX.test(lines[i])) {
        globalEnd = i;
        break;
      }
    }
    const continuationPrompt = lines.slice(firstContentLine + 1, globalEnd).join("\n");
    if (inlineGlobalPrompt && continuationPrompt) {
      globalPrompt = trimEdgeBlankLines(`${inlineGlobalPrompt}\n${continuationPrompt}`);
    } else {
      globalPrompt = trimEdgeBlankLines(inlineGlobalPrompt || continuationPrompt);
    }
    postGlobalLine = globalEnd;
  }

  if (preShotEnd > 0) {
    let videoHeaderLine = -1;
    for (let i = Math.max(0, postGlobalLine); i < preShotEnd; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (VIDEO_HEADER_REGEX.test(line)) {
        videoHeaderLine = i;
      }
      break;
    }

    if (videoHeaderLine !== -1) {
      for (let i = videoHeaderLine + 1; i < preShotEnd; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const propertyMatch = line.match(VIDEO_PROPERTY_REGEX);
        if (!propertyMatch) {
          errors.push({
            line: i + 1,
            message: "Invalid VIDEO metadata declaration:",
            declaration: line,
          });
          continue;
        }

        const key = propertyMatch[1].toLowerCase();
        const rawValue = propertyMatch[2].trim();

        if (key === "width" || key === "height") {
          const parsed = parseInt(rawValue, 10);
          if (!/^\d+$/.test(rawValue) || !Number.isFinite(parsed) || parsed <= 0) {
            errors.push({
              line: i + 1,
              message: `Invalid VIDEO ${key}: must be a positive integer.`,
              declaration: line,
            });
            continue;
          }
          video[key] = parsed;
          continue;
        }

        if (key === "total_duration") {
          const parsed = parseFloat(rawValue);
          if (!/^\d+(?:\.\d+)?$/.test(rawValue) || !Number.isFinite(parsed) || parsed <= 0) {
            errors.push({
              line: i + 1,
              message: "Invalid VIDEO total_duration: must be a positive number.",
              declaration: line,
            });
            continue;
          }
          video.totalDuration = parsed;
          continue;
        }

        errors.push({
          line: i + 1,
          message: "Unsupported VIDEO metadata key:",
          declaration: line,
        });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SHOT_LINE_REGEX.test(line)) continue;

    const headerMatch = line.match(SHOT_HEADER_REGEX);
    if (!headerMatch) {
      const missingDuration = /^\s*(?:CLIP|SHOT)\s+\d+\s*(?:\|\s*)?$/i.test(line);
      errors.push({
        line: i + 1,
        message: missingDuration ? "Missing duration:" : "Invalid shot declaration:",
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
      message: "No SHOT or CLIP blocks found.",
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
    throw new ShotListParseError(errors);
  }

  const shots = headers.map((header, index) => {
    const nextHeader = headers[index + 1];
    const promptLines = lines.slice(header.lineIndex + 1, nextHeader ? nextHeader.lineIndex : lines.length);
    return {
      shotNumber: header.shotNumber,
      duration: header.duration,
      prompt: trimEdgeBlankLines(promptLines.join("\n")),
    };
  });

  const warnings = [];
  const shotDurationTotal = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const metadataDuration = Number(video.totalDuration);
  if (Number.isFinite(metadataDuration) && metadataDuration > 0) {
    const delta = Math.abs(metadataDuration - shotDurationTotal);
    if (delta > 0.001) {
      warnings.push(`VIDEO total_duration (${metadataDuration}s) does not match total SHOT duration (${Number(shotDurationTotal.toFixed(3))}s).`);
    }
  }
  return { globalPrompt, video, shots, warnings };
}

/**
 * @param {ShotListParseIssue[]} errors
 * @returns {string}
 */
function formatShotListParseErrors(errors) {
  return errors.map((error) => {
    if (error.declaration) {
      return `Line ${error.line}:\n${error.message}\n${error.declaration}`;
    }
    return `Line ${error.line}:\n${error.message}`;
  }).join("\n\n");
}

/**
 * @param {{ globalPrompt?: string, video?: ParsedVideoMetadata, shots: ParsedShot[] }} input
 * @returns {string}
 */
function formatShotList(input) {
  const sections = [];
  const globalPrompt = trimEdgeBlankLines(normalizeLineEndings(input.globalPrompt ?? ""));
  if (globalPrompt) {
    sections.push(`GLOBAL: ${globalPrompt}`);
  }
  const formattedVideoMetadata = formatVideoMetadata(input.video);
  if (formattedVideoMetadata) {
    sections.push(formattedVideoMetadata);
  }

  for (const shot of input.shots) {
    const prompt = trimEdgeBlankLines(normalizeLineEndings(shot.prompt ?? ""));
    sections.push(prompt
      ? `SHOT ${shot.shotNumber} | ${formatDurationSeconds(shot.duration)}s\n${prompt}`
      : `SHOT ${shot.shotNumber} | ${formatDurationSeconds(shot.duration)}s`);
  }

  return sections.join("\n\n");
}

/**
 * @param {{ segments?: Array<{ start: number, length: number, prompt?: string }>, globalPrompt?: string, frameRate?: number, video?: ParsedVideoMetadata }} input
 * @returns {string}
 */
function exportTimelineToShotList(input) {
  const frameRate = Number.isFinite(input.frameRate) && input.frameRate > 0 ? input.frameRate : 24;
  const segments = [...(input.segments || [])].sort((a, b) => a.start - b.start);
  const shots = segments.map((segment, index) => ({
    shotNumber: index + 1,
    duration: segment.length / frameRate,
    prompt: segment.prompt || "",
  }));
  const calculatedTotalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const parsedVideoTotalDuration = Number(input.video?.totalDuration);
  const video = {
    width: input.video?.width,
    height: input.video?.height,
    totalDuration: Number.isFinite(parsedVideoTotalDuration) && parsedVideoTotalDuration > 0
      ? parsedVideoTotalDuration
      : calculatedTotalDuration,
  };
  return formatShotList({
    globalPrompt: input.globalPrompt || "",
    video,
    shots,
  });
}

/**
 * @param {{ segments?: Array<{ start: number, length: number, prompt?: string }>, globalPrompt?: string, frameRate?: number, video?: ParsedVideoMetadata }} input
 * @returns {string}
 */
function exportShotList(input) {
  return exportTimelineToShotList(input);
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

/**
 * @param {ParsedVideoMetadata | undefined} video
 * @returns {string}
 */
function formatVideoMetadata(video) {
  if (!video) return "";

  const lines = [];
  const width = Number(video.width);
  const height = Number(video.height);
  const totalDuration = Number(video.totalDuration);

  if (Number.isFinite(width) && width > 0) {
    lines.push(`width: ${Math.round(width)}`);
  }
  if (Number.isFinite(height) && height > 0) {
    lines.push(`height: ${Math.round(height)}`);
  }
  if (Number.isFinite(totalDuration) && totalDuration > 0) {
    lines.push(`total_duration: ${formatDurationSeconds(totalDuration)}`);
  }

  if (lines.length === 0) return "";
  return `VIDEO:\n${lines.join("\n")}`;
}

// Legacy aliases for backward compatibility.
const parseShotScript = (text) => parseShotList(text).shots;
const parseShotScriptDocument = (text) => parseShotList(text);
const formatShotScriptParseErrors = (errors) => formatShotListParseErrors(errors);
const formatShotScript = (input) => formatShotList(input);
const exportTimelineToShotScript = (input) => exportTimelineToShotList(input);
const ShotScriptParseError = ShotListParseError;

const shotListApi = {
  ShotListParseError,
  exportShotList,
  exportTimelineToShotList,
  formatShotList,
  formatShotListParseErrors,
  parseShotList,
  // Legacy exports
  ShotScriptParseError,
  exportTimelineToShotScript,
  formatShotScript,
  formatShotScriptParseErrors,
  parseShotScript,
  parseShotScriptDocument,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = shotListApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.LTXDirectorShotList = shotListApi;
  globalThis.LTXDirectorShotScript = shotListApi;
}
