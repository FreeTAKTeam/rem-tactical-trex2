export function parseMecpEventTitle(title) {
  const parts = String(title || "").trim().split("/");
  if (
    parts.length >= 3 &&
    parts[0].trim().toUpperCase() === "MECP" &&
    /^[0-3]$/.test(parts[1].trim())
  ) {
    return {
      alertLevel: Number(parts[1].trim()),
      title: parts.slice(2).join("/").trim(),
    };
  }

  return {
    alertLevel: null,
    title,
  };
}

