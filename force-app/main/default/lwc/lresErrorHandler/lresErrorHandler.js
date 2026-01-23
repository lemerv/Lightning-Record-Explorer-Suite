import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { normalizeString } from "c/lresFieldUtils";

const DEFAULT_TITLE = "Error";
const DEFAULT_MESSAGE = "An unexpected error occurred.";

/**
 * Normalizes Salesforce errors (wire/imperative/Apex/network) into a reusable shape.
 * Parsing is UI-agnostic so it can be unit tested and reused outside of toasts.
 *
 * @param {any} error Raw error object/string
 * @returns {{ title: string, message: string, messages: string[] }}
 */
export function parseError(error) {
  const primaryMessages = [];
  const fallbackMessages = [];
  const seen = new Set();

  const append = (target, value) => {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    target.push(normalized);
    seen.add(normalized);
  };

  const collectOutputErrors = (output) => {
    if (!output) {
      return;
    }
    if (output.fieldErrors) {
      Object.values(output.fieldErrors).forEach((fieldErrors) => {
        (fieldErrors || []).forEach((fieldError) =>
          append(
            primaryMessages,
            fieldError?.message || fieldError?.errorMessage
          )
        );
      });
    }
    if (Array.isArray(output.errors)) {
      output.errors.forEach((item) =>
        append(primaryMessages, item?.message || item)
      );
    }
    if (Array.isArray(output.pageErrors)) {
      output.pageErrors.forEach((pageError) =>
        append(primaryMessages, pageError?.message || pageError)
      );
    }
  };

  if (typeof error === "string") {
    append(primaryMessages, error);
  }

  const body = error?.body;
  if (Array.isArray(body)) {
    body.forEach((item) => {
      if (item) {
        append(primaryMessages, item.message || item);
      }
    });
  } else if (body) {
    collectOutputErrors(body.output);
    if (Array.isArray(body.pageErrors)) {
      body.pageErrors.forEach((pageError) =>
        append(primaryMessages, pageError?.message)
      );
    }
    append(fallbackMessages, body.message);
  }

  append(fallbackMessages, error?.message);
  append(fallbackMessages, error?.statusText);

  const messages = primaryMessages.length ? primaryMessages : fallbackMessages;
  const message = messages.length
    ? messages.length === 1
      ? messages[0]
      : messages.join("\n")
    : DEFAULT_MESSAGE;

  return {
    title: DEFAULT_TITLE,
    message,
    messages: messages.length ? messages : [message]
  };
}

/**
 * Dispatches a normalized error toast using parsed error details.
 *
 * @param {LightningElement} component Component with dispatchEvent
 * @param {any} error Raw error object/string
 * @param {{ title?: string, message?: string, variant?: string, mode?: string }=} options Overrides for toast presentation
 */
export function showErrorToast(component, error, options = {}) {
  const parsed = parseError(error);
  const detail = {
    title: options.title || parsed.title,
    message: options.message || parsed.message,
    variant: options.variant || "error"
  };
  if (options.mode) {
    detail.mode = options.mode;
  }
  component.dispatchEvent(new ShowToastEvent(detail));
}
