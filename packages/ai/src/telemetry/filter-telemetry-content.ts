/**
 * Removes prompt and completion content from telemetry payloads while keeping
 * the surrounding event metadata available to integrations and tracing
 * channel subscribers.
 */
export function filterTelemetryContent<T>(
  value: T,
  {
    recordInputs,
    recordOutputs,
  }: {
    recordInputs?: boolean;
    recordOutputs?: boolean;
  },
  seen = new WeakMap<object, unknown>(),
): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(filterTelemetryContent(item, { recordInputs, recordOutputs }, seen));
    }
    return result as T;
  }

  // Preserve non-plain objects (e.g. Date, typed arrays, and SDK class
  // instances). SDK event classes are cloned with their prototype so their
  // non-sensitive getters continue to work.
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    !Object.getOwnPropertyNames(prototype).some(name =>
      ['text', 'reasoning', 'reasoningText', 'files', 'sources'].includes(name),
    )
  ) {
    return value;
  }

  const result = Object.create(prototype) as Record<string, unknown>;
  seen.set(value as object, result);

  const inputFields = new Set(['instructions', 'messages', 'prompt', 'input', 'body']);
  const outputFields = new Set([
    'content',
    'text',
    'reasoning',
    'reasoningText',
    'files',
    'sources',
    'output',
    'body',
  ]);

  for (const key of Object.keys(value as object)) {
    if (recordInputs === false && inputFields.has(key)) {
      result[key] = key === 'messages' ? [] : undefined;
    } else if (recordOutputs === false && outputFields.has(key)) {
      result[key] =
        key === 'content' || key === 'reasoning' || key === 'files' || key === 'sources'
          ? []
          : key === 'text'
            ? ''
            : undefined;
    } else {
      result[key] = filterTelemetryContent(
        (value as Record<string, unknown>)[key],
        { recordInputs, recordOutputs },
        seen,
      );
    }
  }

  // StepResult exposes generated text through prototype getters. Define
  // sanitized own properties so those getters cannot reconstruct hidden data.
  if (recordOutputs === false) {
    for (const key of ['text', 'reasoning', 'reasoningText', 'files', 'sources']) {
      if (key in (value as object) && !(key in result)) {
        Object.defineProperty(result, key, {
          value:
            key === 'text'
              ? ''
              : key === 'reasoning' || key === 'files' || key === 'sources'
                ? []
                : undefined,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }

  return result as T;
}
