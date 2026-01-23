import { ShowToastEvent } from "lightning/platformShowToastEvent";
import {
  parseError,
  showErrorToast as showErrorToastHelper
} from "c/lresErrorHandler";
import { normalizeString } from "c/lresFieldUtils";

export const DEBUG_PREFIX = "[KanbanExplorer]";
const DEFAULT_NOTICE = "An unexpected error occurred.";

function emitLog(level, message, detail) {
  const entry = `${DEBUG_PREFIX} ${message}`;
  try {
    const logger =
      typeof console !== "undefined" && typeof console[level] === "function"
        ? console[level]
        : console && typeof console.log === "function"
          ? console.log
          : null;
    if (!logger) {
      return;
    }
    if (detail !== undefined) {
      Function.prototype.apply.call(logger, console, [entry, detail]);
    } else {
      Function.prototype.apply.call(logger, console, [entry]);
    }
  } catch (loggingError) {
    try {
      if (typeof console !== "undefined" && typeof console.log === "function") {
        let renderedDetail = "";
        if (detail !== undefined) {
          try {
            renderedDetail = ` ${JSON.stringify(detail)}`;
          } catch {
            renderedDetail = " [object]";
          }
        }
        const fallbackEntry = `${entry} (logger error: ${loggingError?.message || loggingError})`;
        Function.prototype.apply.call(console.log, console, [
          `${fallbackEntry}${renderedDetail}`
        ]);
      }
    } catch {
      // Swallow logging errors in production environments.
    }
  }
}

export function logDebug(component, message, detail) {
  if (!component?._debugLoggingEnabled) {
    return;
  }
  emitLog("debug", message, detail);
}

export function logInfo(component, message, detail) {
  if (!component?._debugLoggingEnabled) {
    return;
  }
  emitLog("info", message, detail);
}

export function logWarn(component, message, detail) {
  if (!component?._debugLoggingEnabled) {
    return;
  }
  emitLog("warn", message, detail);
}

export function logError(component, message, detail) {
  if (!component?._debugLoggingEnabled) {
    return;
  }
  emitLog("error", message, detail);
}

export function showToast(
  component,
  { title, message, variant = "info", mode } = {}
) {
  if (variant === "error") {
    return showErrorToastHelper(component, message, { title, mode });
  }
  const detail = {
    title: title || (variant === "success" ? "Success" : "Notice"),
    message: normalizeString(message) || DEFAULT_NOTICE,
    variant
  };
  if (mode) {
    detail.mode = mode;
  }
  return component.dispatchEvent(new ShowToastEvent(detail));
}

export function formatError(component, error) {
  const parsed = parseError(error);
  logDebug(component, "formatError normalized message.", {
    messages: parsed.messages
  });
  return parsed.message;
}

export function showErrorToast(component, error, options = {}) {
  return showErrorToastHelper(component, error, options);
}
