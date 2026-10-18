export function pageMeta(title: string, description: string) {
  const brandedTitle = `${title} — Wine & Virtue`;
  return [
    { title: brandedTitle },
    { name: "description", content: description },
    { property: "og:title", content: brandedTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ];
}