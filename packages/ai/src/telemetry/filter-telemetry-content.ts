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
  parentKey?: string,
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
      result.push(
        filterTelemetryContent(item, { recordInputs, recordOutputs }, seen, parentKey),
      );
    }
    return result as T;
  }

  // Keep built-ins with internal slots intact. Other objects are cloned with
  // their prototype so SDK result getters continue to work on filtered data.
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Error ||
    value instanceof Promise ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);

  const result = Object.create(prototype) as Record<string, unknown>;
  seen.set(value as object, result);

  const inputFields = new Set([
    'instructions',
    'messages',
    'prompt',
    'input',
    'body',
  ]);
  const outputFields = new Set([
    'content',
    'text',
    'reasoning',
    'reasoningText',
    'files',
    'sources',
    'output',
    'body',
    '_output',
    'initialResponseMessages',
    'responseMessages',
    'toolCalls',
    'staticToolCalls',
    'dynamicToolCalls',
    'toolResults',
    'staticToolResults',
    'dynamicToolResults',
    'ranking',
  ]);

  for (const key of Object.keys(value as object)) {
    if (
      (recordInputs === false && inputFields.has(key)) ||
      (recordOutputs === false &&
        (outputFields.has(key) || (parentKey === 'response' && key === 'messages')))
    ) {
      result[key] =
        key === 'messages' ||
        key === 'content' ||
        key === 'reasoning' ||
        key === 'files' ||
        key === 'sources' ||
        key === 'initialResponseMessages' ||
        key === 'responseMessages' ||
        key === 'toolCalls' ||
        key === 'staticToolCalls' ||
        key === 'dynamicToolCalls' ||
        key === 'toolResults' ||
        key === 'staticToolResults' ||
        key === 'dynamicToolResults' ||
        key === 'ranking'
          ? []
          : key === 'text'
            ? ''
            : undefined;
    } else {
      result[key] = filterTelemetryContent(
        (value as Record<string, unknown>)[key],
        { recordInputs, recordOutputs },
        seen,
        key,
      );
    }
  }

  if (
    recordOutputs === false &&
    'output' in (value as object) &&
    !Object.prototype.hasOwnProperty.call(result, 'output')
  ) {
    Object.defineProperty(result, 'output', {
      value: undefined,
      enumerable: true,
      configurable: true,
    });
  }

  return result as T;
}
