// Seeds a promoted movement's background.json from the lead section of its
// Wikipedia article. Wikipedia text is CC BY-SA, so the attribution block is
// mandatory and is appended here rather than left to the caller.

export function summaryUrl(articleUrl) {
  const title = String(articleUrl || '').split('/wiki/').pop() || '';
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
}

export function buildBackgroundBlocks(extract, title, url) {
  const text = String(extract || '').trim();
  if (!text) return [];
  const paras = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  return [
    { type: 'h', text: 'Background' },
    ...paras.map((t) => ({ type: 'p', text: t })),
    {
      type: 'p',
      text: `This background is adapted from the Wikipedia article "${title}" (${url}), available under the CC BY-SA 4.0 licence.`,
    },
  ];
}
