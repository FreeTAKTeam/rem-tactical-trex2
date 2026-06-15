const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /("apiToken"\s*:\s*")[^"]*(")/gi,
  /(apiToken=)[^&\s]+/gi,
];

export function redactSensitive(value) {
  let text =
    typeof value === "string" ? value : JSON.stringify(value, null, 0) || "";

  TOKEN_PATTERNS.forEach((pattern) => {
    text = text.replace(pattern, (match, prefix = "", suffix = "") => {
      if (match.toLowerCase().startsWith("bearer ")) {
        return "Bearer [REDACTED]";
      }
      return `${prefix}[REDACTED]${suffix}`;
    });
  });

  return text;
}

export function safeLog(logger, message, detail) {
  const line =
    detail === undefined
      ? message
      : `${message}: ${redactSensitive(detail)}`;

  if (logger && typeof logger.log === "function") {
    logger.log(line);
  } else if (typeof console !== "undefined" && console.log) {
    console.log(line);
  }
}
