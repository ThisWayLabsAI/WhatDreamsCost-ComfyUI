// @ts-check

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
 * @property {ParsedVideoMetadata} video
 * @property {ParsedShot[]} shots
 */

/**
 * @typedef {Object} ParsedVideoMetadata
 * @property {number | undefined} width
 * @property {number | undefined} height
 * @property {number | undefined} totalDuration
 */

const GLOBAL_HEADER_REGEX = /^\s*GLOBAL:\s*(.*)$/i;
const VIDEO_HEADER_REGEX = /^\s*VIDEO:\s*$/i;
const VIDEO_PROPERTY_REGEX = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i;
const CLIP_LINE_REGEX = /^\s*(?:CLIP|SHOT)\b/i;
const CLIP_HEADER_REGEX = /^\s*(?:CLIP|SHOT)\s+(\d+)\s*\|\s*(.*?)\s*$/i;
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
  /** @type {ParsedVideoMetadata} */
  const video = { width: undefined, height: undefined, totalDuration: undefined };
  const firstShotLine = lines.findIndex((line) => CLIP_LINE_REGEX.test(line));
  const preShotEnd = firstShotLine === -1 ? lines.length : firstShotLine;
  let postGlobalLine = firstContentLine;

  if (firstContentLine !== -1 && GLOBAL_HEADER_REGEX.test(lines[firstContentLine])) {
    const globalHeaderMatch = lines[firstContentLine].match(GLOBAL_HEADER_REGEX);
    const inlineGlobalPrompt = globalHeaderMatch ? globalHeaderMatch[1] : "";
    let globalEnd = preShotEnd;
    for (let i = firstContentLine + 1; i < lines.length; i++) {
      if (CLIP_LINE_REGEX.test(lines[i]) || VIDEO_HEADER_REGEX.test(lines[i])) {
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
    if (!CLIP_LINE_REGEX.test(line)) continue;

    const headerMatch = line.match(CLIP_HEADER_REGEX);
    if (!headerMatch) {
      const missingDuration = /^\s*(?:CLIP|SHOT)\s+\d+\s*(?:\|\s*)?$/i.test(line);
      errors.push({
        line: i + 1,
        message: missingDuration ? "Missing duration:" : "Invalid clip declaration:",
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
        message: "Invalid clip declaration:",
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
      message: "No CLIP or SHOT blocks found.",
    });
  }

  const seenShotNumbers = new Map();
  for (const header of headers) {
    if (seenShotNumbers.has(header.shotNumber)) {
      errors.push({
        line: header.line,
        message: `Duplicate clip number: ${header.shotNumber}`,
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
      prompt: trimEdgeBlankLines(promptLines.join("\n")),
    };
  });

  return { globalPrompt, video, shots };
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
 * @param {{ globalPrompt?: string, video?: ParsedVideoMetadata, shots: ParsedShot[] }} input
 * @returns {string}
 */
function formatShotScript(input) {
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
      ? `CLIP ${shot.shotNumber} | ${formatDurationSeconds(shot.duration)}s\n${prompt}`
      : `CLIP ${shot.shotNumber} | ${formatDurationSeconds(shot.duration)}s`);
  }

  return sections.join("\n\n");
}

/**
 * @param {{ segments?: Array<{ start: number, length: number, prompt?: string }>, globalPrompt?: string, frameRate?: number, video?: ParsedVideoMetadata }} input
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
  const calculatedTotalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const parsedVideoTotalDuration = Number(input.video?.totalDuration);
  const video = {
    width: input.video?.width,
    height: input.video?.height,
    totalDuration: Number.isFinite(parsedVideoTotalDuration) && parsedVideoTotalDuration > 0
      ? parsedVideoTotalDuration
      : calculatedTotalDuration,
  };
  return formatShotScript({
    globalPrompt: input.globalPrompt || "",
    video,
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
