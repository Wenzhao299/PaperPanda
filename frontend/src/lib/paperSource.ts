function humanizeVenue(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) {
    return "";
  }
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 4) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function formatPaperSource(source: string): string {
  const raw = (source || "").trim();
  if (!raw) {
    return "未知来源";
  }
  const lowered = raw.toLowerCase();
  if (lowered === "arxiv") {
    return "arXiv";
  }

  if (lowered === "conference") {
    return "会议";
  }
  if (lowered === "journal") {
    return "期刊";
  }

  if (lowered.startsWith("conference.") || lowered.startsWith("journal.")) {
    const [, venue = ""] = lowered.split(".", 2);
    const venueLabel = humanizeVenue(venue);
    if (venueLabel) {
      return venueLabel;
    }
    return lowered.startsWith("conference.") ? "会议" : "期刊";
  }

  return raw;
}

export function isArxivSource(source: string): boolean {
  return (source || "").trim().toLowerCase() === "arxiv";
}
